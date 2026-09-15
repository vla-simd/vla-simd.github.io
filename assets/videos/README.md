# Robot rollout videos

Drop an `.mp4` here under the exact filename below and the matching placeholder on the page
turns into a player by itself — no HTML edit. A `<video>` tag already points at each path;
the placeholder art hides as soon as the file loads.

Encode 4:3 (the cards use `aspect-ratio: 4/3`), H.264 + AAC or silent, web-optimised:

    ffmpeg -i in.mov -vf "scale=960:720:force_original_aspect_ratio=increase,crop=960:720" \
           -c:v libx264 -crf 23 -preset slow -pix_fmt yuv420p -an -movflags +faststart out.mp4

## Expected files (13)

### SO-101 · A — IMPACT, fp32, multi-task checkpoint (996.6 ms)
    so101-impact-tape-box.mp4          "Put the tape into the box"    90% (70-97)
    so101-impact-tape-cup.mp4          "Put the tape into the cup"    85% (64-95)
    so101-impact-cup-box.mp4           "Put the cup into the box"     60% (39-78)

### SO-101 · B — IMPACT, int8 W8A8, multi-task checkpoint (429.4 ms)
    so101-impact-int8-tape-box.mp4     "Put the tape into the box"    85% (64-95)
    so101-impact-int8-tape-cup.mp4     "Put the tape into the cup"    95% (76-99)
    so101-impact-int8-cup-box.mp4      "Put the cup into the box"     50% (30-70)

### SO-101 · C — ACT, no language conditioning (915.0 ms)
    so101-act-multitask.mp4            all three, one checkpoint      20% (8-42)
    so101-act-single-tape-box.mp4      "Put the tape into the box"    60% (39-78)
    so101-act-single-tape-cup.mp4      "Put the tape into the cup"    90% (70-97)
    so101-act-single-cup-box.mp4       "Put the cup into the box"     80% (58-92)

### SO-101 · D — IMPACT, long-horizon drawer checkpoint (996.6 ms)
    so101-impact-drawer.mp4            "Put the tape into the drawer" 65% (43-82)

### UR10e · E — SmolVLA under vla.simd
    ur10e-smolvla-m4.mp4               Apple M4, 685 ms               60% (39-78)
    ur10e-smolvla-ryzen.mp4            Ryzen 5 5500, 1316 ms          60% (39-78)

## Anonymity

Strip metadata before publishing, and check that no face, badge, whiteboard or screen in
frame identifies the lab:

    exiftool -all= *.mp4
