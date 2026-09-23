# Robot rollout videos

These are tracked in git — the page needs them to serve. Six conditions are live; the
other seven from the paper's tables were removed from the page because no footage exists
for them.

A card upgrades itself: each `<video>` already points at its path, and the placeholder art
hides on `loadedmetadata`. Dropping a file in is the whole workflow, no HTML edit.

## Live (6)

### SO-101 · A — IMPACT, fp32, multi-task checkpoint (996.6 ms)
    so101-impact-tape-box.mp4     "Put the tape into the box"     90% (70-97)
    so101-impact-tape-cup.mp4     "Put the tape into the cup"     85% (64-95)
    so101-impact-cup-box.mp4      "Put the cup into the box"      60% (39-78)

### SO-101 · B — IMPACT, long-horizon drawer checkpoint (996.6 ms)
    so101-impact-drawer.mp4       "Put the tape into the drawer"  65% (43-82)

### UR10e · C — SmolVLA + Robotiq gripper, served from two CPUs (Table VII)
    ur10e-smolvla-m4-3x.mp4       "Put the cup into the box"      60% (39-78), M4 1177 ms
    ur10e-smolvla-ryzen-3x.mp4    "Put the cup into the box"      60% (39-78), Ryzen 2343 ms

Both UR10e clips are played at 3× speed (the episodes run ~40 s); the `-3x` suffix marks
that. Latencies are the mean query round-trip from Table VII, not the engine latency.

## Not on the page — restore the cards if footage appears

Seven conditions from the paper's two real-robot tables have no video, so their cards were
deleted from `index.html`. Re-adding one means restoring its `.vid` block as well as the
file. Recover the markup from git history: `git log -p -- index.html`.

    IMPACT int8, multi-task (429.4 ms)   tape->box 85%, tape->cup 95%, cup->box 50%
    ACT, no language (915.0 ms)          all-three 20%, and three fixed-goal: 60/90/80%

## Encoding

Cards are `aspect-ratio: 16/9`, matching the SO-101 files (1920x1080, H.264, 30 fps).

    ffmpeg -i in.MOV -c:v libx264 -crf 23 -preset slow -pix_fmt yuv420p \
           -an -map_metadata -1 -movflags +faststart out.mp4

The UR10e clips are additionally sped up 3× from their ~40 s originals, which are 640×480
at 20 fps rather than 1080p:

    ffmpeg -i ur-<host>-side.mp4 -filter:v "setpts=PTS/3" -r 30 -an \
           -c:v libx264 -crf 23 -preset slow -pix_fmt yuv420p \
           -map_metadata -1 -movflags +faststart ur10e-smolvla-<host>-3x.mp4

The cards are 16/9 and the video is `object-fit: cover`, so a 4:3 source is centre-cropped;
the UR10e framing survives that, losing only the top of the arm and some foreground carpet.

`-map_metadata -1` is the part that matters: it drops the GPS, make and model tags the
phone writes. Check before committing anything new, because git history is permanent:

    ffprobe -v error -show_entries format_tags -of default=nw=1 out.mp4

The six current files pass clean. Also check that nothing in frame — a face, a badge, a
whiteboard, a screen — identifies the lab.
