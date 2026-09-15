# Prop preparation substitution, 2026-09-10

## Scope

The next component-preparation boundary is prepareComponentProps. Its normal
implementation scans inputs for task-backed values; this fixed fixture always
returns its original props. The diagnostic asserts that identity on every normal
call, then substitutes the identity result in treatment blocks. It does not
cache props or reuse component instances. State creation, compiled rendering,
hydration and cleanup remain active. Four preparation calls occur per render.

Hypothesis before measurement: approximately 1 to 5 percent HTTP headroom.
The compiled scalar-prop proof already skips some preparations, so this measures
only the remaining calls. No proposal to skip real task dependencies follows
from this fixed-input experiment.

Two fresh Node string workers each run normal/substitution/normal, ten seconds
HTTP warmup and five seconds per block. Two fresh drivers per block each hold
16 requests in flight. Controls average adjacent normal blocks in the same
worker. Isolated loops before/after each block warm and measure 10,000 renders.
Instrumentation and workstation workload affect timings, so do not compare
these controls with unrelated workers or claim exclusive CPU cost.

## Results

| Worker | Normal RPS | Identity RPS | Change | Normal HTTP us | Identity HTTP us |
| ------ | ---------: | -----------: | -----: | -------------: | ---------------: |
| 1      |      8,440 |        8,681 | +2.86% |          58.47 |            56.39 |
| 2      |      8,624 |        8,684 | +0.69% |          57.03 |            56.62 |

All 257,727 measured responses match the complete 4,672-byte document,
zero errors. Four ordinary/escaped full-document parity cases pass. Counters
confirm bypassed scans. Artifact and adapter hashes are checked and owned
worker/load processes close. Raw isolated durations remain in summary.json.

## Decision

This is only the prop-dependency scan, not all component preparation. Use its
measured size to prioritize the next boundary. Any real optimization must retain
pending, failed and cancelled task-input behavior and correctly handle authored
props. The broader tree cost still includes compiler issuance, frame allocation,
program operation construction and execution. No production change is accepted
from this diagnostic; the Node/Bun string/stream objective remains open.

The adjacent archive includes raw blocks, summaries, source/check/runner scripts,
frozen current and diagnostic artifacts, fixture and verified SHA-256 inventory.
Workspace dependencies are not included as a standalone distribution.
