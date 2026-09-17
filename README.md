# Project page — "vla.simd: Efficient CPU Inference for Language-Conditioned Manipulation"

Anonymous project page for the ICRA 2027 submission. Static, no build step:

    python3 -m http.server -d . 8000

## Layout

    index.html              the whole page (inline CSS, ~20 lines of JS)
                            order: highlights, abstract, video, SMK demo, method, robot
    assets/smk-app.js       the SMK Tiling Algorithm simulator
    assets/vla.simd.mp4     hero overview video (+ -poster.jpg)
    assets/*.png            figures rasterised from the paper's PDFs
    assets/videos/*.mp4     four SO-101 rollout clips; see assets/videos/README.md

## Theme

Follows [nerfies.github.io](https://nerfies.github.io/): Bulma's neutrals, Noto Sans /
Google Sans throughout, dark rounded pill buttons, a 960px column and 10px radii.

    Dark        #363636   headings, buttons
    Text        #4a4a4a   body
    Muted       #7a7a7a   captions
    Border      #dbdbdb   rules, card edges
    Panel       #f5f5f5   stat tiles, callouts, code blocks
    Link        #3273dc   links, app accents

One deliberate departure from nerfies, which has no second accent: two names stay
colour-coded so the engine and the policy read apart.

    Engine      #3D5A80   `vla.simd` — slate, always monospace so it never reads as a link
    Policy      #0F766E   IMPACT — teal (`.imp`, and `.tag.ours` on the video cards)

Baselines (ACT, SmolVLA) stay neutral. Light only; `color-scheme: light` stops browsers
auto-inverting it.

## Videos

Five in total, all tracked in git.

`assets/vla.simd.mp4` is the hero overview, placed after the link buttons the way nerfies
places its teaser. It is 1:55 **with an audio track**, so it does not autoplay — browsers
block autoplay with sound, and a two-minute clip should not loop. It gets controls and a
poster frame (`assets/vla.simd-poster.jpg`, extracted with `ffmpeg -ss 2`).

The four SO-101 rollout clips are silent and 8-22s, so they carry
`autoplay muted loop playsinline` and play on load. See
[assets/videos/README.md](assets/videos/README.md).

## SMK Tiling Algorithm mini-app

`assets/smk-app.js` runs the paper's register-tile selection live. It implements the three
constraints and the φ ranking exactly as written, so with stock parameters it reproduces the
paper's results: **6×16 on AVX2 at 15 of 16 registers** and **4×16 on NEON at 24 of 32**, with
2×32 as the AVX2 runner-up (the tile the paper measures at 683 GFLOP/s).

Seven targets: the four devices from the paper's device table, plus AVX-512 and SVE-256 as
hypotheticals and a fully editable custom target. Badges mark which were actually evaluated.
Every microarchitectural field — `L`, `R_max`, `P_fma`, `P_ld`, `τ`, `g`, operand mode — is
editable; the verdict says so once you touch one.

The register budget is drawn per tile, one cell per architectural register, using the paper's
own role names: accumulator (m_r n_v), weight (n_v), broadcast/laned (q), reserved. The three
constraints are shown with the numbers substituted.

Two things the app is careful about:

- **`Spills()` cannot be computed.** The paper obtains it by disassembling the compiled inner
  loop, so it is a toggle, seeded only with the two verdicts the paper states — NEON 9×8 and
  5×16 both need 29 of 32 registers, yet only 5×16 spills. Everything else is labelled
  *not measured*.
- **The alternative ranking is included as a caveat, not a claim.** The "by issue ratio" toggle
  ranks by the lane-indexed ratio m_r n_v / Λ, which puts the narrow n_r = 8 tiles above 4×16 —
  the paper reports this for 9×8 and 8×8, and that measurement on the Cortex-A76 nonetheless
  makes 4×16 12% and 19% faster. The shipped algorithm ranks by φ.

To add a target, append to `PLATFORMS` at the top of `assets/smk-app.js`.

## Robot videos

Four conditions are live, all IMPACT fp32 on the SO-101: three multi-task instructions and
the long-horizon drawer task. Each card carries the policy tag, instruction, checkpoint,
latency and the success rate with its CI.

The other nine conditions from the paper's two real-robot tables had no footage, so their
cards were removed from the page rather than left as placeholders. The placeholder
mechanism still works for anything added later — a card upgrades itself when its file
appears, no HTML edit. Filenames, and what to restore if more footage arrives, are in
[assets/videos/README.md](assets/videos/README.md).

The transcoded `.mp4` files are tracked (~11 MB, metadata-stripped and verified). The raw
`.MOV` originals are not, and `.gitignore` explains why.

## Anonymity

No author names, affiliations, institution, repository link or contact address;
`<meta name="robots" content="noindex">` keeps it out of search indexes. The figure PNGs are
rasterised, so they carry no PDF metadata. Strip metadata from the videos too before
publishing.

The venue line, the "Under review" note and the BibTeX block have been removed, so the page
no longer states that it is a blind submission — but it still carries no author, affiliation
or repository information. To de-anonymise later, the places to edit are the two `.btn.soon`
buttons in `<nav class="links">` and the footer.

## Adding the paper PDF

Compile `main.tex` with `\reviewfalse` — the current `main.pdf` still carries revision marks
and a `\todo` — put the result at `assets/paper.pdf`, then replace

    <a class="btn soon" href="#"><span class="ic">▣</span> Paper</a>

with

    <a class="btn" href="assets/paper.pdf"><span class="ic">▣</span> Paper</a>

## Regenerating a figure

    pdftoppm -png -r 300 -singlefile figs/<name>.pdf assets/<name>

Three rendered figures are kept on disk but no longer shown on the page: `budget.png` (the
removed teaser), `vlasimd-so101.png` and `ur10e.png` (the removed bench photos). The page now
shows `vlasimd-simd.png`, `vlasimd-impact.png` and `speedup-bar.png` only.

`budget.png` is the one figure with no standalone PDF — `figs/budget.tex` is pgfplots source —
so it is cropped out of page 1 of the compiled paper:

    pdftoppm -png -r 400 -f 1 -l 1 -x 1745 -y 780 -W 1690 -H 840 main.pdf assets/budget
