# Hydration validation necessity and cost, September 8, 2026

Status: contract review and renderer experiments completed. No production behavior, ABI, or validation default is changed. This report distinguishes requirements from policy choices rather than treating every existing check as inherently necessary.

## What the traversal does

For compiler-declared positional values, validation and object-to-tuple projection are already one traversal. The resulting framework-created arrays are passed to JSON serialization without a second validation traversal. Removing validation does not remove the need to construct the positional representation.

The client reconstructs ordinary objects from those tuples. It does not restore values lost through JSON coercion. Compiler field metadata describes layout, but does not prove that request-time values match it. Structurally open values use a separate descriptor-based traversal, and reactive collection discovery also occurs during validation.

The positional output is a compact array representation. JavaScript array holes have their own JSON behavior, becoming null cells; compact positional encoding does not itself make that behavior safe for every authored value.

## Which guarantees are necessary?

| Guarantee                                                                     | Purpose and assessment                                                                                                                                                                                                                                                                                                       |
| ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Escape script-breaking JSON text                                              | Keep. JSON stringification alone does not protect an inline HTML script element from closing-script text. This is separate from graph validation.                                                                                                                                                                            |
| Avoid silent changes to authored values                                       | Keep under the current hydration model. Undefined array cells and non-finite numbers become null. Supporting those values requires explicit encoding/decoding or a documented normalization model, not simply removing checks.                                                                                               |
| Preserve fields when runtime shape differs from compiler metadata             | Keep. The named-object fallback preserves fields that positional projection would otherwise discard. A declared-fields-only serialization policy would be a deliberate feature change.                                                                                                                                       |
| Bound depth, traversal work, and encoded bytes                                | Keep the public limits. Native stringification can fail on cycles or deep input, but does not enforce the configured budgets. These limits are resource controls, not a guarantee that arbitrary authored JavaScript cannot consume resources.                                                                               |
| Maintain a separate active-ancestor tracker                                   | The mechanism is negotiable. The requirement is bounded, terminating traversal with correct shared-reference handling. Projection occurs before JSON serialization, so delegating cycle errors to JSON is not by itself a complete replacement. Existing version-one projector callbacks also receive a native Set contract. |
| Require ordinary object prototypes                                            | A representation policy, not intrinsically an HTML security requirement. Class-instance support could be designed deliberately, with clear client reconstruction semantics. It would not restore methods or prototypes through ordinary JSON.                                                                                |
| Reject generic enumerable accessors                                           | A side-effect and determinism policy, not a universal security requirement. Declared positional getters already run once. Supporting generic getters would require deciding whether to snapshot their results so validation and serialization do not read changing values twice.                                             |
| Produce an exact failing path                                                 | Diagnostic quality, not wire correctness. Path recording already occurs only after the fast traversal fails, so removing it does not eliminate a successful-request walk.                                                                                                                                                    |
| Revalidate framework-owned tuple structure like arbitrary application objects | Unnecessary. Existing direct metadata paths already avoid generic descriptor inspection of those containers. Their application-owned children still need handling.                                                                                                                                                           |

Prototype and accessor restrictions should not be described as a sandbox for server code. Application code already executes on the server, and the traversal does not establish a universal no-side-effects guarantee for every JavaScript object or proxy.

## Measured costs

Node 26.8.1 and Bun 1.4.2 ran the existing compiled comparison fixture with preloaded data. Each process warmed each variant for 3,000 full renders, then alternated variant order for twelve rounds of 10,000 full renders. A render includes HTML, hydration, and byte accounting into an accumulating string sink. Safe-fixture output and byte counts must match before timing. There is no HTTP transport in these measurements, and workstation background load was not controlled.

Three initial variants compare the unchanged artifact, a semantics-preserving primitive-field inline path, and a deliberately unchecked schema-leaf path. The unchecked leaf variant also skips traversal of generic objects at those leaves; it is a cost probe, not a proposed production implementation.

| Capture              | Original, microseconds | Inline primitive fields | Unchecked leaves |
| -------------------- | ---------------------: | ----------------------: | ---------------: |
| Node, first process  |                  19.96 |                   19.03 |            19.43 |
| Node, second process |                  18.32 |                   18.58 |            18.32 |
| Bun                  |                  16.48 |                   16.90 |            16.54 |

The inline gain does not repeat, and removing leaf validation does not establish a gain either. Neither candidate is adopted.

A separate intentionally unchecked projection retains object-to-array conversion but removes positional schema guards, ownership and prototype checks, ancestor tracking, and positional depth/node enforcement. Outer hydration-envelope validation remains. This estimates the possible value of optimizing this traversal on valid fixture data; it is not a safe optimization.

| Runtime | Original, microseconds | Unchecked projection | Time reduction |
| ------- | ---------------------: | -------------------: | -------------: |
| Node    |                  21.19 |                19.30 |           9.0% |
| Bun     |                  17.62 |                16.92 |           4.0% |

These are full-render timing differences, not percentages of HTTP throughput. They do not isolate an individual container check or establish a universal maximum benefit.

## Observable consequences of removal

The archived behavior probe mutates an existing incident's version or adds an extra field, then renders the real compiled fixture through both artifacts:

- An undefined version fails in the original path and is accepted by the unchecked projection, where JSON emits a null positional cell.
- A NaN version likewise becomes a null positional cell instead of failing.
- An additional runtime field survives through the original named-object fallback but disappears from unchecked positional output.

The behavior probe asserts those acceptance and field-preservation differences. It retains the emitted hydration strings for inspection. It is evidence that the unchecked cost probe changes semantics, not regression coverage for an adopted implementation.

## Decision

Do not remove guarantees merely because JSON serialization follows the traversal. Also do not preserve a particular validation mechanism just because a test names it. The promising next work is to reduce container/projection overhead or move provable layout work to artifact preparation. Changes to generic accessor and prototype policy deserve an explicit application-facing design and should be evaluated separately from this fixture's predominantly positional path.

The [evidence archive](ssr-validation-costs-2026-09-08-evidence.zip) contains the baseline and experimental compiled artifacts, scripts, raw timing rounds, and behavioral output. The [summary](ssr-validation-costs-2026-09-08.json) records means for each capture. Workspace runtime dependencies are required. Public performance charts remain unchanged. See the preceding [SSR path-cost investigation](ssr-path-costs-2026-09-08.md).
