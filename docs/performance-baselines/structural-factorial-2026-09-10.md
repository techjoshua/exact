# Separating shell and detail composition

Status: diagnostic comparison, no production adoption. This follows the
[four-mode HTTP comparison](structural-composition-http-2026-09-10.md).

## Question and controls

The combined prototype improved Node string throughput but showed a small Bun
streaming decline. This follow-up separates shell composition and detail
composition to determine whether either effect can be assigned to one part.

Four artifacts start from the combined prototype. The baseline restores the
original Document implementation, IncidentDetail implementation, and its outer
program descriptor. Shell-only restores the detail definitions; detail-only
restores Document; combined retains both changes. All contain the same unused
prototype helper definitions. The baseline therefore exercises the original
rendering paths but is a matched experimental control, not a byte-identical copy
of the retained build. Dormant module initialization and engine behavior prevent
assuming that its absolute rate equals the retained artifact's rate.

The builder uses AST-selected initializer replacements with assertions. All four
full response texts match before measurement, including the application-owned
document, dynamic four-asset shell, application rendering, and hydration.

## Method

Node 26.8.1 string and native Bun 1.4.2 streaming are the two cells. Each variant
has an independent worker and ten-second warmup. Eight four-variant orderings
balance each variant across measurement positions. Each block lasts 1.5 seconds
with two fresh drivers at concurrency 16. Workers, drivers, service, and owner
run below normal priority in production mode. Only one variant receives load at
a time. No concurrent tests, builds, or profiling run. PC use remains variable.

There are 64 measured blocks, 820,019 valid responses, and zero errors. Every
response matches its worker's expected complete body identity. All task-owned
processes close; only the existing user Codex Node process remains. React is not
rerun here; the prior four-mode capture remains the contemporaneous React evidence.

## Results

Mean RPS, higher is better:

| Cell | Matched control | Shell only | Detail only | Combined |
| --- | ---: | ---: | ---: | ---: |
| Node string | 8,027 | 8,073 | 7,792 | 10,255 |
| Bun stream | 8,484 | 8,567 | 8,426 | 8,519 |

Paired comparisons with the matched control:

| Cell / variant | Mean change | Median paired change | Positive pairs |
| --- | ---: | ---: | ---: |
| Node string / shell | +0.57% | +3.10% | 5/8 |
| Node string / detail | -2.92% | -0.87% | 4/8 |
| Node string / combined | +27.75% | +27.70% | 8/8 |
| Bun stream / shell | +0.97% | +1.43% | 6/8 |
| Bun stream / detail | -0.68% | -1.43% | 3/8 |
| Bun stream / combined | +0.41% | +0.20% | 4/8 |

Node's combined variant also beats shell-only and detail-only in all eight paired
blocks, by mean ratios of 27.02% and 31.60%. Compared with control, its individual
paired gains range from 14.98% to 45.57%. Shell-only and detail-only each contain
large positive and negative pairs. These results do not support adding their
independent mean changes to predict the combined result.

Bun's earlier 1.74% combined decline does not repeat. This capture is essentially
neutral for the combined candidate, with evenly split pair directions. Detail-only
is slightly slower on average, but this is not enough to assign a stable runtime
regression to that change. No new Bun gain is established either.

## Interpretation and next action

The combined Node string advantage has now appeared in two HTTP captures, including
one against the retained artifact and this matched-control test. Its magnitude
varies and the controls differ, so 27.75% is not a replacement estimate for the
earlier 17.89% result. Both captures support investigating the combined execution
shape; neither establishes a generic compiler optimization or final acceptance.

The isolated changes do not explain the observed combined gain. This could involve
runtime optimization, call-site behavior, allocation/access patterns, or worker
state. The capture does not identify which, and no JIT or GC explanation is claimed.
Do not turn the additive source-level construction savings into an additive CPU
model contradicted by these observations.

Next compare actual Node HTTP execution for matched control, the combined candidate,
and a partial variant. Attribute the difference to executed stages and, if the
evidence supports it, runtime compilation behavior. Preserve the complete prototype
while investigating; do not drop either part because its isolated mean is weak.
Keep Bun performance unresolved rather than treating the prior small decline as
confirmed or the new small increase as a win.

Compiler integration, task/cancellation guarantees, browser adoption, and all four
workload acceptance checks remain outstanding. Production source and canonical
artifacts are unchanged. The adjacent evidence archive contains the builder,
runner, analyzer, raw rows, summary, log, all measured artifacts, report, and a
verified SHA-256 manifest. Each artifact hash is checked against its measured rows.
