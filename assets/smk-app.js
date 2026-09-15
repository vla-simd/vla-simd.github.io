/* SMK Tiling Algorithm — register tile for one target.
   A faithful simulator of the paper's selection procedure. Everything it computes comes from
   the constraints in the paper; the only thing it cannot compute is Spills(), which the paper
   obtains by disassembly, so that is exposed as an editable oracle seeded with the two verdicts
   the paper reports. */
(function () {
  'use strict';

  var PLATFORMS = [
    { id:'i9', isa:'AVX2', name:'Intel Raptor Lake', sub:'i9-14900HX', tag:'paper',
      L:8, Rmax:16, Pfma:2, Pld:2, tau:4, mode:'broadcast', g:64, paper:'6x16' },

    { id:'zen3', isa:'AVX2', name:'AMD Zen 3', sub:'Ryzen 5 5500', tag:'paper',
      L:8, Rmax:16, Pfma:2, Pld:2, tau:4, mode:'broadcast', g:64, paper:'6x16' },

    { id:'a76', isa:'NEON', name:'Arm Cortex-A76', sub:'Raspberry Pi 5', tag:'paper',
      L:4, Rmax:32, Pfma:2, Pld:2, tau:4, mode:'laned', g:64, paper:'4x16',
      spills:{'5x16':true}, measured:{'5x16':'spills','9x8':'clean'} },

    { id:'m4', isa:'NEON', name:'Apple M4', sub:'P-core', tag:'device',
      L:4, Rmax:32, Pfma:4, Pld:3, tau:4, mode:'laned', g:64,
      spills:{'5x16':true}, measured:{'5x16':'spills','9x8':'clean'},
      note:'The paper routes dense products on Apple silicon through Accelerate, so no SMK tile ' +
           'ships for this target. The pipe counts below are vendor figures, not paper measurements.' },

    { id:'avx512', isa:'AVX-512', name:'AVX-512', sub:'Sapphire Rapids class', tag:'hypo',
      L:16, Rmax:32, Pfma:2, Pld:2, tau:4, mode:'broadcast', g:64,
      note:'Not evaluated in the paper. Shown to exercise the algorithm on a wider vector.' },

    { id:'sve256', isa:'SVE', name:'Arm SVE 256-bit', sub:'Neoverse V1 class', tag:'hypo',
      L:8, Rmax:32, Pfma:2, Pld:2, tau:4, mode:'laned', g:64,
      note:'Not evaluated in the paper. Shown to exercise the algorithm on a wider vector.' },

    { id:'custom', isa:'—', name:'Custom target', sub:'every field editable', tag:'hypo',
      L:8, Rmax:32, Pfma:2, Pld:2, tau:4, mode:'broadcast', g:64,
      note:'Not evaluated in the paper.' }
  ];

  var PAPER_TILES = {
    '6x16': 'AVX2, 15 of 16 registers. 708 GFLOP/s on an i5-12400F at six threads, against ' +
            '683 GFLOP/s for the next feasible tile.',
    '4x16': 'NEON, 24 of 32 registers. 106.9 GFLOP/s on the Pi 5 at four threads, against ' +
            '97.2 GFLOP/s for the spilling 5×16 tile.'
  };

  var S = null;           // live target state
  var view = null;        // tile key currently shown in the budget panel
  var rank = 'phi';       // 'phi' | 'issue'
  var el = {};

  /* ---------------- the algorithm ---------------- */

  function qreg(mr, mode) { return mode === 'broadcast' ? 1 : mr; }

  function lambda(nv, mr, L, mode) {
    return mode === 'broadcast' ? nv + mr : nv + mr / L;
  }

  function phi(mr, nv) { return (mr * nv) / (nv + mr); }               // paper's rank key

  function issueRatio(mr, nv, L, mode) {                               // lane-indexed ratio
    return (mr * nv) / lambda(nv, mr, L, mode);
  }

  function evaluate(mr, nr, t) {
    var nv = nr / t.L, q = qreg(mr, t.mode), acc = mr * nv;
    var regs = acc + nv + q, lam = lambda(nv, mr, t.L, t.mode);
    return {
      key: mr + 'x' + nr, mr: mr, nr: nr, nv: nv, q: q, acc: acc, regs: regs, lam: lam,
      c1: regs <= t.Rmax,
      c2: acc >= t.Pfma * t.tau,
      c3: acc * t.Pld >= lam * t.Pfma,
      spill: !!t.spills[mr + 'x' + nr],
      phi: phi(mr, nv),
      issue: issueRatio(mr, nv, t.L, t.mode)
    };
  }

  function selectTile(t) {
    var rows = [], best = null, key = rank === 'phi' ? 'phi' : 'issue';
    for (var nr = t.L; nr <= t.g; nr += t.L) {
      if (t.g % nr !== 0) continue;                      // n_r | g   (and L | n_r by construction)
      var row = { nr: nr, nv: nr / t.L, pick: null, rejected: [], consulted: [] };
      for (var mr = t.Rmax; mr >= 1; mr--) {
        var c = evaluate(mr, nr, t);
        if (c.c1 && c.c2 && c.c3) row.consulted.push(c);  // Spills() is asked only here
        if (c.c1 && c.c2 && c.c3 && !c.spill) { row.pick = c; break; }
        row.rejected.push(c);
      }
      rows.push(row);
      if (row.pick && (!best || row.pick[key] > best[key])) best = row.pick;
    }
    return { rows: rows, best: best };
  }

  /* ---------------- helpers ---------------- */

  function n(x) { return Math.abs(x - Math.round(x)) < 1e-9 ? String(Math.round(x)) : x.toFixed(2); }
  function why(c) {
    if (!c.c1) return 'over the register file';
    if (!c.c2) return 'too few accumulators for FMA latency';
    if (!c.c3) return 'load ports saturate';
    if (c.spill) return 'inner loop spills';
    return '';
  }
  /* The first rejection is nearly always (1) at m_r = R_max, which says nothing useful. Report the
     largest m_r that actually fits the register file: that is where the binding constraint shows. */
  function binding(rej) {
    for (var i = 0; i < rej.length; i++) if (rej[i].c1) return rej[i];
    return rej[0];
  }
  function setTarget(id) {
    var p = null, i;
    for (i = 0; i < PLATFORMS.length; i++) if (PLATFORMS[i].id === id) p = PLATFORMS[i];
    S = {
      id: p.id, L: p.L, Rmax: p.Rmax, Pfma: p.Pfma, Pld: p.Pld, tau: p.tau,
      mode: p.mode, g: p.g, spills: {}, meta: p, dirty: false
    };
    for (var k in (p.spills || {})) S.spills[k] = p.spills[k];
    view = null;
  }

  /* ---------------- rendering ---------------- */

  function renderTargets() {
    el.targets.innerHTML = PLATFORMS.map(function (p) {
      var badge = p.tag === 'paper' ? '<em class="smk-b paper">in the paper</em>'
                : p.tag === 'device' ? '<em class="smk-b dev">paper device</em>'
                : '<em class="smk-b hypo">hypothetical</em>';
      return '<button type="button" class="smk-target' + (p.id === S.id ? ' on' : '') +
             '" data-id="' + p.id + '"><b>' + p.name + '</b><span>' + p.isa + ' · ' + p.sub +
             '</span>' + badge + '</button>';
    }).join('');
  }

  function field(k, label, hint, min, max) {
    return '<label class="smk-f"><span class="smk-fl">' + label + '</span>' +
      '<input type="number" data-k="' + k + '" value="' + S[k] + '" min="' + min + '" max="' + max +
      '" step="1"><span class="smk-fh">' + hint + '</span></label>';
  }

  function renderParams() {
    el.params.innerHTML =
      field('L', '<i>L</i>', 'fp32 lanes per register', 1, 32) +
      field('Rmax', '<i>R</i><sub>max</sub>', 'architectural vector registers', 4, 64) +
      field('Pfma', '<i>P</i><sub>fma</sub>', 'FMA pipes', 1, 8) +
      field('Pld', '<i>P</i><sub>ld</sub>', 'load pipes', 1, 8) +
      field('tau', '<i>τ</i>', 'FMA latency, cycles', 1, 12) +
      field('g', '<i>g</i>', 'gcd of packed layer widths', 1, 1024) +
      '<label class="smk-f"><span class="smk-fl">operand mode</span>' +
      '<select data-k="mode">' +
      '<option value="broadcast"' + (S.mode === 'broadcast' ? ' selected' : '') + '>broadcast (AVX2)</option>' +
      '<option value="laned"' + (S.mode === 'laned' ? ' selected' : '') + '>lane-indexed (NEON)</option>' +
      '</select><span class="smk-fh">' +
      (S.mode === 'broadcast' ? '<i>q</i> = 1, Λ = <i>n</i><sub>v</sub> + <i>m</i><sub>r</sub>'
                              : '<i>q</i> = <i>m</i><sub>r</sub>, Λ = <i>n</i><sub>v</sub> + <i>m</i><sub>r</sub>/<i>L</i>') +
      '</span></label>';
  }

  function renderTable(res) {
    var maxPhi = 0;
    res.rows.forEach(function (r) { if (r.pick) maxPhi = Math.max(maxPhi, r.pick[rank === 'phi' ? 'phi' : 'issue']); });

    var body = res.rows.map(function (r) {
      if (!r.pick) {
        var reason = r.rejected.length ? why(binding(r.rejected)) : 'no candidate';
        return '<tr class="smk-none"><th>' + r.nr + '</th><td colspan="4">no feasible <i>m</i><sub>r</sub> — ' +
               reason + '</td></tr>';
      }
      var p = r.pick, v = p[rank === 'phi' ? 'phi' : 'issue'];
      var win = res.best && p.key === res.best.key;
      var skipped = r.rejected.length
        ? '<span class="smk-skip">skipped <i>m</i><sub>r</sub> ' + r.rejected[0].mr +
          (r.rejected.length > 1 ? '–' + r.rejected[r.rejected.length - 1].mr : '') +
          ': ' + why(binding(r.rejected)) + '</span>' : '';
      return '<tr class="' + (win ? 'smk-win ' : '') + (view === p.key ? 'smk-sel' : '') +
             '" data-key="' + p.key + '" tabindex="0">' +
             '<th>' + r.nr + '</th>' +
             '<td><b>' + p.mr + '×' + p.nr + '</b>' + (win ? ' <span class="smk-crown">selected</span>' : '') +
             skipped + '</td>' +
             '<td class="smk-num">' + p.regs + ' / ' + S.Rmax + '</td>' +
             '<td class="smk-bar"><span style="width:' + (100 * v / (maxPhi || 1)).toFixed(1) + '%"></span></td>' +
             '<td class="smk-num">' + v.toFixed(3) + '</td></tr>';
    }).join('');

    el.table.innerHTML =
      '<table><thead><tr><th class="smk-math"><i>n</i><sub>r</sub></th><th>first feasible tile</th>' +
      '<th>registers</th><th colspan="2" class="smk-math">' +
      (rank === 'phi' ? 'φ = <i>m</i><sub>r</sub><i>n</i><sub>v</sub>/(<i>n</i><sub>v</sub>+<i>m</i><sub>r</sub>)'
                      : '<i>m</i><sub>r</sub><i>n</i><sub>v</sub>/Λ') +
      '</th></tr></thead><tbody>' + body + '</tbody></table>';
  }

  function renderBudget(res) {
    var c = null;
    if (view) { var p = view.split('x'); c = evaluate(+p[0], +p[1], S); }
    else if (res.best) c = res.best;

    if (!c) {
      el.budget.innerHTML = '<div class="smk-bot"><b>⊥ — unpacked fallback.</b> ' +
        'No <i>n</i><sub>r</sub> is both a multiple of <i>L</i> = ' + S.L +
        ' and a divisor of <i>g</i> = ' + S.g + ' with a feasible <i>m</i><sub>r</sub>, so the ' +
        'algorithm returns ⊥ and the layer runs unpacked.</div>';
      return;
    }

    /* the output tile, one cell per accumulator register */
    var tile = '';
    for (var i = 0; i < c.mr; i++) {
      tile += '<div class="smk-trow">';
      for (var j = 0; j < c.nv; j++) tile += '<i class="acc"></i>';
      tile += '</div>';
    }

    /* the register file, one cell per architectural register */
    var cells = '', used = 0;
    for (var r = 0; r < S.Rmax; r++) {
      var cls = r < c.acc ? 'acc' : r < c.acc + c.nv ? 'wt' : r < c.regs ? 'op' : 'free';
      if (cls !== 'free') used++;
      cells += '<i class="' + cls + '"></i>';
    }

    var ok = function (b) { return b ? '<span class="smk-ok">✓</span>' : '<span class="smk-no">✗</span>'; };
    var spillRow = '';
    if (c.c1 && c.c2 && c.c3) {
      var m = (S.meta.measured || {})[c.key];
      spillRow = '<tr><td>Spills(' + c.mr + ',' + c.nr + ')</td><td class="smk-eq">' +
        '<label class="smk-tog"><input type="checkbox" data-spill="' + c.key + '"' +
        (S.spills[c.key] ? ' checked' : '') + '> reloads a register from the stack</label>' +
        (m ? '<em class="smk-b paper">measured: ' + (m === 'spills' ? 'spills' : 'clean') + '</em>'
           : '<em class="smk-b hypo">not measured</em>') +
        '</td><td>' + ok(!c.spill) + '</td></tr>';
    }

    el.budget.innerHTML =
      '<div class="smk-bgrid">' +
        '<div><h4>Output tile — ' + c.mr + '×' + c.nr + '</h4>' +
          '<div class="smk-tile">' + tile + '</div>' +
          '<p class="smk-cap"><i>m</i><sub>r</sub> = ' + c.mr + ' rows × <i>n</i><sub>v</sub> = ' +
          c.nv + ' register' + (c.nv > 1 ? 's' : '') + ' per row, each holding <i>L</i> = ' + S.L +
          ' lanes, so the tile is ' + c.mr + '×' + c.nr + ' values, held in registers for the ' +
          'whole depth sweep.</p></div>' +
        '<div><h4>Register budget — ' + used + ' of ' + S.Rmax + '</h4>' +
          '<div class="smk-regs">' + cells + '</div>' +
          '<ul class="smk-leg">' +
            '<li><i class="acc"></i>accumulator × ' + c.acc + '</li>' +
            '<li><i class="wt"></i>weight × ' + c.nv + '</li>' +
            '<li><i class="op"></i>' + (S.mode === 'broadcast' ? 'broadcast' : 'laned') +
              ' × ' + c.q + '</li>' +
            '<li><i class="free"></i>reserved × ' + (S.Rmax - c.regs) + '</li>' +
          '</ul></div>' +
      '</div>' +
      '<table class="smk-checks"><tbody>' +
        '<tr><td>(1) register file</td><td class="smk-eq"><i>m</i><sub>r</sub><i>n</i><sub>v</sub> + <i>n</i><sub>v</sub> + <i>q</i> = ' +
          c.acc + ' + ' + c.nv + ' + ' + c.q + ' = <b>' + c.regs + '</b> ≤ ' + S.Rmax +
          '</td><td>' + ok(c.c1) + '</td></tr>' +
        '<tr><td>(2) FMA latency</td><td class="smk-eq"><i>m</i><sub>r</sub><i>n</i><sub>v</sub> = <b>' + c.acc +
          '</b> ≥ <i>P</i><sub>fma</sub>τ = ' + (S.Pfma * S.tau) + '</td><td>' + ok(c.c2) + '</td></tr>' +
        '<tr><td>(3) load ports</td><td class="smk-eq"><i>m</i><sub>r</sub><i>n</i><sub>v</sub><i>P</i><sub>ld</sub> = <b>' +
          (c.acc * S.Pld) + '</b> ≥ Λ<i>P</i><sub>fma</sub> = ' + n(c.lam * S.Pfma) +
          ' &nbsp;<span class="smk-dim">(Λ = ' + n(c.lam) + ')</span></td><td>' + ok(c.c3) + '</td></tr>' +
        spillRow +
      '</tbody></table>';
  }

  function renderVerdict(res) {
    var out = '';
    if (!res.best) {
      out = '<b>Returns ⊥.</b> No feasible tile, so the layer falls back to the unpacked path.';
    } else {
      var b = res.best, tag = '';
      if (S.meta.paper && !S.dirty && rank === 'phi') {
        tag = b.key === S.meta.paper
          ? '<span class="smk-match">matches the paper</span>'
          : '<span class="smk-diff">the paper selects ' + S.meta.paper.replace('x', '×') + '</span>';
      }
      out = '<b>Selected: ' + b.mr + '×' + b.nr + '</b> ' + tag +
            '<span class="smk-vsub">' + b.regs + ' of ' + S.Rmax + ' registers · φ = ' +
            b.phi.toFixed(3) + '</span>';
      if (PAPER_TILES[b.key] && !S.dirty) out += '<span class="smk-vnote">' + PAPER_TILES[b.key] + '</span>';
    }
    if (S.meta.note) out += '<span class="smk-vnote">' + S.meta.note + '</span>';
    if (S.dirty) out += '<span class="smk-vnote">Parameters edited, so this no longer describes the ' +
                        'stock target. <button type="button" class="smk-reset">Reset</button></span>';
    if (rank === 'issue') out += '<span class="smk-vnote"><b>Ranking by the lane-indexed issue ratio.</b> ' +
      'This ratio, and the register-level arithmetic intensity of Low et al., both put the narrow ' +
      '<i>n</i><sub>r</sub>&nbsp;=&nbsp;8 tiles above 4\u00d716. The paper reports that ranking for ' +
      '9\u00d78 and 8\u00d78, and that measurements on the Cortex-A76 nonetheless make 4\u00d716 ' +
      '12% and 19% faster than those two. The shipped algorithm ranks by \u03c6.</span>';
    el.verdict.innerHTML = out;
  }

  function render() {
    var res = selectTile(S);
    renderTargets(); renderParams(); renderTable(res); renderBudget(res); renderVerdict(res);
    var rb = document.querySelectorAll('#smk-app [data-rank]');
    for (var i = 0; i < rb.length; i++)
      rb[i].setAttribute('aria-pressed', rb[i].dataset.rank === rank ? 'true' : 'false');
  }

  /* ---------------- wiring ---------------- */

  function init() {
    var root = document.getElementById('smk-app');
    if (!root) return;
    ['targets', 'params', 'table', 'budget', 'verdict'].forEach(function (k) {
      el[k] = root.querySelector('[data-pane="' + k + '"]');
    });

    root.addEventListener('click', function (e) {
      var t = e.target.closest('.smk-target');
      if (t) { setTarget(t.dataset.id); rank = 'phi'; return render(); }
      var row = e.target.closest('tr[data-key]');
      if (row) { view = view === row.dataset.key ? null : row.dataset.key; return render(); }
      if (e.target.closest('.smk-reset')) { setTarget(S.id); return render(); }
      var rb = e.target.closest('[data-rank]');
      if (rb) { rank = rb.dataset.rank; return render(); }
    });

    root.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      var row = e.target.closest('tr[data-key]');
      if (row) { e.preventDefault(); view = view === row.dataset.key ? null : row.dataset.key; render(); }
    });

    root.addEventListener('change', function (e) {
      var sp = e.target.dataset.spill;
      if (sp !== undefined) { S.spills[sp] = e.target.checked; S.dirty = true; return render(); }
      var k = e.target.dataset.k;
      if (!k) return;
      if (k === 'mode') S.mode = e.target.value;
      else {
        var v = parseInt(e.target.value, 10);
        if (isNaN(v) || v < 1) return;
        S[k] = v;
      }
      S.dirty = true; view = null; render();
    });

    setTarget('i9');
    render();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
