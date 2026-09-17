# Robot rollout videos

These are tracked in git — the page needs them to serve. Four conditions are live; the
other nine from the paper's tables were removed from the page because no footage exists
for them.

A card upgrades itself: each `<video>` already points at its path, and the placeholder art
hides on `loadedmetadata`. Dropping a file in is the whole workflow, no HTML edit.

## Live (4)

### SO-101 · A — IMPACT, fp32, multi-task checkpoint (996.6 ms)
    so101-impact-tape-box.mp4     "Put the tape into the box"     90% (70-97)
    so101-impact-tape-cup.mp4     "Put the tape into the cup"     85% (64-95)
    so101-impact-cup-box.mp4      "Put the cup into the box"      60% (39-78)

### SO-101 · B — IMPACT, long-horizon drawer checkpoint (996.6 ms)
    so101-impact-drawer.mp4       "Put the tape into the drawer"  65% (43-82)

## Not on the page — restore the cards if footage appears

Nine conditions from the paper's two real-robot tables have no video, so their cards were
deleted from `index.html`. Re-adding one means restoring its `.vid` block as well as the
file. Recover the markup from git history: `git log -p -- index.html`.

    IMPACT int8, multi-task (429.4 ms)   tape->box 85%, tape->cup 95%, cup->box 50%
    ACT, no language (915.0 ms)          all-three 20%, and three fixed-goal: 60/90/80%
    UR10e + Robotiq, SmolVLA             Apple M4 60%, Ryzen 5 5500 60%

## Encoding

Cards are `aspect-ratio: 16/9`, matching the current files (1920x1080, H.264, 30 fps).

    ffmpeg -i in.MOV -c:v libx264 -crf 23 -preset slow -pix_fmt yuv420p \
           -an -map_metadata -1 -movflags +faststart out.mp4

`-map_metadata -1` is the part that matters: it drops the GPS, make and model tags the
phone writes. Check before committing anything new, because git history is permanent:

    ffprobe -v error -show_entries format_tags -of default=nw=1 out.mp4

The four current files pass clean. Also check that nothing in frame — a face, a badge, a
whiteboard, a screen — identifies the lab.
