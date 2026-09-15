# Explicit stack for structural SSR traversal

Status: implemented and tested as a scratch prototype. No repeatable Node HTTP
throughput improvement established; no production change accepted.

## What changed

The current SSR crawler does not use JavaScript generators. children.ts uses a
sibling loop, recursive render-target calls, and promise continuations for pending
work. The proposed stack experiment therefore targets recursion and traversal
allocation rather than generator suspension.

The prototype replaces shared-sink traversal through prepared dynamic ranges,
lists, and eligible keyed wrappers with an explicit stack. Frames retain child
index, adjacent-text state, marker closing state and depth ownership. This avoids
creating another ChildrenOutput and SsrOperationTarget for those nested carriers.
The hypothesis is that fewer recursive calls, target objects and marker callbacks
reduce HTTP rendering overhead. Stack frames introduce their own allocation and
dispatch cost, so fewer traversal objects alone cannot establish an improvement.

Compiled component writers retain their normal execution and sink API. Other node
kinds retain existing dispatch. Non-shared-sink capture retains its original path.
This is a structural traversal experiment, not a completed conversion of the entire
component/render-program execution graph to one stack and not a second renderer.
It makes no claim to eliminate recursion between compiled component writers.

Opening pressure must settle before descendants run; closing markers must follow
descendants and their drains. Stack failure unwinds entered depths without writing
closing spans. Actual pending child work still uses awaitSsrProgramSink. Node,
depth, output accounting, markers and text separators remain observable contracts.

## Validation

- 16 full-document parity cases each on Node and Bun, covering string and stream
  rendering, changed selected-incident content, asset sets and a missing route.
- 610 Node string limit comparisons: node limits 1 through 500, depth limits 1
  through 30, and 80 output byte limits. All outputs or failures match.
- 16 structural tests covering markers on/off, adjacent text, nested ranges and
  lists, sink pressure, write failure, drain failure and depth failure. Writes,
  errors, node counts and final zero depth match the current implementation.

The first synthetic pressure harness incorrectly created a distinct promise for
each ready call while the same write remained pending. That produced inconsistent
drain-failure ordering. The corrected sink exposes one pending promise per write;
the parity checks then pass. This harness correction is not a framework fix.

These checks do not replace package/compiler acceptance, browser hydration testing,
or broader pending-component task/cancellation coverage. No production source or
canonical build was modified.

## HTTP results

Two fresh four-worker populations run current/stack/stack/current and then
stack/current/current/stack startup assignments. Each worker receives 100,000
validated warmup requests and eight balanced 1.5-second measurement blocks with
two fresh drivers at concurrency 16. Production Node 26.8.1 and below-normal
priority are retained; no build, test or profiler runs during measurement. User
PC workload may vary. The original worker and complete document response are used.

| Population           | Current RPS | Stack RPS | Change |
| -------------------- | ----------: | --------: | -----: |
| First                |       8,508 |     8,844 | +3.95% |
| Reversed assignments |       9,094 |     8,366 | -8.00% |
| Pooled               |       8,801 |     8,605 | -2.22% |

Individual worker means in startup order:

- First: current 8,287; stack 8,388; stack 9,301; current 8,730.
- Second: stack 7,653; current 9,094; current 9,094; stack 9,080.

The 64 measured blocks contain 837,758 valid responses and zero errors, excluding
800,000 warmup requests and preflights. Artifact/worker hashes are verified against
measurement rows. All owned processes close; only the user's Codex Node remains.
Raw rows retain the inherited label combined for the stack variant, but their
entry paths and hashes identify the structural-stack artifact.

The result does not support adopting this prototype as a throughput optimization.
It also does not rule out a larger compiler/runtime redesign that schedules
component writers through an explicit stack. Such a redesign must account for
imperative writer sequencing, scopes and actual suspension; simply replacing
structural recursion is not equivalent. Preserve this prototype and evidence
without changing the canonical renderer or claiming a React comparison from this
current-versus-stack capture.

The adjacent archive includes prototype builder and artifacts, parity/limit/
lifecycle checks and results, HTTP runner and ownership helpers, warmups, raw
measurements, summary, current artifact/worker, and verified SHA-256 manifest.
