# Result consumption HTTP acceptance, September 10, 2026

Status: rejected and restored to the preceding implementation. Canonical Node
and Bun artifacts are byte-identical to the pre-experiment retained build.

## Method

The integrated candidate is compared with the frozen previous build and React,
using the three-incident full application-owned documents and four asset tags.
Node uses Node HTTP and Bun uses its native Fetch adapter and separate build.
String and streaming modes are tested separately. Production environment and
below-normal process priority are used throughout.

For each runtime/mode, three independent servers remain alive after ten-second
warmups. Six permutations rotate candidate, baseline and React through 1.5-second
measurement blocks. Only one server receives benchmark traffic at a time. Two
fresh drivers per block use concurrency 16 each. Total completed/valid requests
divided by the union of driver measurement windows gives each block's rate.
No builds, tests, or profiles run alongside these measurements. The user is using
the PC, so workload drift remains a limitation despite interleaving.

All initial documents have complete framing and assets. Baseline and candidate
eXact documents match exactly. Every measured response is checked against its
server's whole-body byte count and hash. All 773,420 measured responses
are valid, with 0 errors. There are 72 measured blocks.

## Results

Mean requests/s across six blocks. Change compares candidate to previous eXact.

| Runtime | Mode   | Previous eXact | Candidate |  React | Change | Improved blocks |
| ------- | ------ | -------------: | --------: | -----: | -----: | --------------: |
| node    | string |          7,823 |     6,419 | 10,292 | -17.9% |             0/6 |
| node    | stream |          5,479 |     5,645 |  4,068 |  +3.0% |             4/6 |
| bun     | string |          8,456 |     8,647 |  8,764 |  +2.3% |             5/6 |
| bun     | stream |          6,458 |     6,688 |  6,929 |  +3.6% |             3/6 |

Node string rendering regresses in every block, whereas Bun string improves in
five of six. The in-process screen's favorable Node result therefore does not
transfer to this HTTP workload. The streaming path does not use the changed
finalizer; its differences are counter-evidence against attributing every rate
change to this optimization. None of these short populations establishes exact
causal percentages or universal framework capacity.

## Decision and restoration

The significant, consistent Node string regression does not justify retaining
this implementation for the smaller Bun gain. The former fresh hydrated-result
wrapper, helper name, ownership semantics and enumeration order are restored.
Candidate source/artifacts remain in the integration evidence archive and frozen
scratch copies for diagnosis. No runtime-specific fork is introduced.

Metadata/frozen-preload and failure-before-mutation assertions added during the
experiment remain useful tests of the original implementation. Reused-input
independence is restored in its test. The SSR package and comparison applications
rebuild successfully, and all five focused result tests pass. Restored Node/Bun
bundle hashes match the original frozen artifacts exactly; the earlier full
360-test and 56-browser validation of that build remains applicable. Broader
suites were not newly rerun after restoration.

Restored Node SHA-256:
`2ebf7fed2ee0dc972095976bf55230ccc924a120251a463af26838e8ebb2cd18`.
Restored Bun SHA-256:
`9adc04f4d5d6e78ad95730319a475918c3b4b045da9a93f812c81aa827d60d2e`.

The cause of the Node HTTP/in-process discrepancy is unresolved. The next
investigation should compare the actual HTTP response path and object lifetime
with in-process string consumption, using these frozen artifacts. Lower sampled
allocation did not prove lower GC cost or higher HTTP throughput.

The overall objective remains unmet: the retained build trails React in string
mode on both runtimes and in Bun streaming in this capture, while Node streaming
leads. The adjacent archive preserves runners, raw driver output and identities,
summary, exact measured artifacts, restoration logs, and a SHA-256 manifest.

Follow-up: [Node telemetry comparison](consume-result-telemetry-2026-09-10.md) found only a 1.3% mean difference with mixed block directions. The earlier 18% regression magnitude is not stable across captures, and no major GC regression was established. Production remains restored pending stronger evidence.
