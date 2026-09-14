# Conditional ownership in the direct writer

Date: 2026-09-09. Prototype experiment; production unchanged.

The previous rebased direct writer attached cleanup to every program. This candidate executes the
generated writer first, retains failure cleanup if it acquired sibling preparation, and returns
directly when no preparation exists. The generated preparation phase must run synchronously before
the first possible child suspension. This condition holds for the current transformed direct sites;
it is not a general guarantee for arbitrary future writer programs.

The hypothesis was that removing empty cleanup callbacks would recover some of the direct writer's
regression. The control is the rebased direct-writer prototype, not current production. Thirty-two
fresh production processes cover Node/Bun, string/consumed stream, small/large documents with four
assets, and two reversed-order pairs. Each has 5,000 warmups and 12,000 measured renders. Every paired
document hash matches, and no completed population was discarded. Positive means slower rendering.

| Runtime | Mode | Fixture | Pair 1 time change | Pair 2 time change |
| --- | --- | --- | ---: | ---: |
| node | string | small | +0.17% | +2.28% |
| node | string | large | +0.07% | +2.05% |
| node | stream | small | +1.20% | -0.14% |
| node | stream | large | -3.77% | +0.81% |
| bun | string | small | -4.45% | -0.98% |
| bun | string | large | +2.53% | -6.29% |
| bun | stream | small | -0.73% | -5.92% |
| bun | stream | large | -2.44% | -3.18% |

The result is mixed and does not establish a generally faster direct writer. It does not justify
production adoption or a claim of React parity. Do not combine these percentages with a previous
run to derive current production or React throughput. The callback change is preserved as an
experimental variant; its value needs evaluation alongside a more substantial sink integration.

Six actual compiled sibling-task cases pass across Node/Bun: success, failure before the second
child, and abort with the task gate still closed. Both tasks start together and each distinct child
is disposed once. Eight additional cases without preparation cover synchronous/asynchronous child
success/failure and verify HTML, primary error identity, and document host cleanup. These tests
protect both branches of the new scope decision. They are not browser or full public API coverage.

The remaining prototype limitations from the direct-current report still apply: general component
slots, complete enhancement/boundary capture, selective task waiting, early shell publication, and
backpressure. This is renderer timing, not HTTP or browser timing. No new React run is claimed.

The archive contains both artifacts, builders, fixtures, tests, observations, fixed input, and a
verified SHA-256 manifest. The production unowned-program build and its retained improvements remain
unchanged. The broader goal remains incomplete.
