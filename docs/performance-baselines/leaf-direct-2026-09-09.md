# Direct leaf output experiment, September 9, 2026

The isolated prototype improves all three measured Bun large-string pairs, while Node results are
mixed. The follow-up found small-string regressions and mixed streaming results, so it is not retained.

## Hypothesis and implementation

The previous leaf-string experiment still returned a one-element array. This follow-up transforms
13 compiler-generated leaf writers in the current retained artifact to return their string directly.
It also removes the runtime's `{ segments }` result wrapper, accepts the completed string in the
shared output consumer, and avoids deferred-reference preparation for completed leaf strings.
All slots still prepare before writing. Existing escaping, root attribute serialization, character
limits, and document host handling remain in the prototype. Component-bearing programs still
materialize segments. Prepared invocation objects and eager value arrays are not eliminated.

The hypothesis is that fewer temporary arrays and wrapper objects reduce allocation and output
assembly cost, benefiting Bun in particular. The experiment uses generated-artifact rewriting to
test that hypothesis before expanding the compiler/runtime contract. It directly references runtime
helpers inside the bundled artifact; a production design needs explicit compiler operations and
independent correctness tests. Passing fixture hashes does not establish that contract's safety.

## Measurements

Production mode, complete application-owned documents, 96 incidents, empty client asset tags,
string output. Three alternating orders per runtime, 5,000 warmups and 18,000 measured renders
per fresh process. Node 26.8.1 and Bun 1.4.2 load the same portable artifact. Every pair retains an
identical full response SHA-256 hash. No React result was measured in this focused experiment.

| Runtime | Current median, microseconds | Prototype median, microseconds | Paired reductions      |
| ------- | ---------------------------: | -----------------------------: | ---------------------- |
| node    |                       275.77 |                         272.14 | -1.63%, +3.68%, -0.19% |
| bun     |                       361.64 |                         348.89 | +9.05%, +4.02%, +3.20% |

The Bun direction is consistent but the size varies. Node has two slight regressions and one gain.
The follow-up below evaluates Bun streaming and small documents before a production contract change.
It does not establish a Node improvement. It also leaves the more substantial prepared-invocation
materialization boundary untouched, so it is not a complete test of compiler/runtime fusion.

No production source or public API changed. Browser, HTTP, cancellation, and adversarial contract
validation were not run for this prototype. The overall performance goal remains unmet.

[Raw results](leaf-direct-2026-09-09.json) and [evidence archive](leaf-direct-2026-09-09-evidence.zip)
include the baseline, prototype, transformation scripts, fixture, and runner. Reproduction requires
locked repository dependencies and both runtimes on PATH.

## Follow-up and disposition

Twenty-four additional populations cover small strings and small/large streaming on both runtimes,
with two reverse orders, 5,000 warmups, and 10,000 measured renders each. Response hashes match.
Paired changes below are reductions in microseconds per render; negative values are regressions.

| Runtime | Output | Workload | First pair | Second pair |
| ------- | ------ | -------- | ---------: | ----------: |
| node    | string | small    |    -35.97% |      +0.44% |
| node    | stream | small    |    +11.87% |      -2.07% |
| node    | stream | large    |     -2.35% |      +1.18% |
| bun     | string | small    |     -6.21% |      -4.41% |
| bun     | stream | small    |     +4.34% |      +3.00% |
| bun     | stream | large    |     +0.17% |      -2.83% |

Small Bun strings regress in both pairs. Bun small streaming improves, but large streaming does
not establish a gain. Node is mixed, with a large first small-string regression that does not repeat.
These machine-local measurements do not establish the cause of each timing difference. They do
not support adopting the prototype as a general improvement. The retained production build remains
unchanged. Full compiler/runtime fusion still requires a separate evaluation because this prototype
retains prepared invocations and their eager slot arrays.
