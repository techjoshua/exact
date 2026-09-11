# Identical-build Node ordering control, September 10, 2026

Status: diagnostic control for interpreting short HTTP comparisons.

Several unrelated candidates showed a large final Node block reversal. Two
independent Node workers now run exactly the same retained eXact artifact, with
matching artifact SHA-256 and complete response hash. React remains the third
worker. The six permutations of A, B, and React are measured after ten-second
warmups, using 1.5-second blocks and two fresh concurrency-16 drivers. Processes
run below normal priority in production mode while the PC remains in active use.

| Block | eXact A requests/s | Identical eXact B | B relative to A |
| --- | ---: | ---: | ---: |
| 0 | 6,045 | 6,224 | +3.0% |
| 1 | 6,820 | 6,982 | +2.4% |
| 2 | 7,494 | 7,904 | +5.5% |
| 3 | 7,540 | 6,967 | -7.6% |
| 4 | 6,298 | 7,061 | +12.1% |
| 5 | 7,331 | 6,722 | -8.3% |
| Mean | 6,921 | 6,977 | +0.8% |

React averages 10,678 requests/s. All 221,803 measured responses pass complete
byte/hash validation, with zero errors.

The final-block reversal occurs without any implementation change. This does
not identify its cause as order, OS scheduling, GC, or user activity, but does
show that a single similar reversal cannot establish a candidate regression.
There is no confidence interval or universal noise threshold implied here.

Future three-variant screens should cover all six permutations instead of four
selected orders. Pair direction, magnitude, repeats, and identical-build controls
should inform interpretation. The larger eXact-versus-React Node gap remains
substantial in both identical workers; this control is not evidence that the
remaining framework gap is only measurement noise.

Raw blocks, analyzer, and the exact executed harness are preserved in
[the follow-up archive](document-publication-followup-2026-09-10-evidence.zip).
