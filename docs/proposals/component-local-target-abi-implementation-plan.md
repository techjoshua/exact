# Component-local target ABI implementation plan

## Status and relationship to the proposal

This is the execution plan for the
[component-local target ABI proposal](component-local-target-abi.md). The proposal owns the target
architecture and acceptance invariants. This document owns implementation order, phase gates, and
the performance-evidence protocol used while reaching that architecture.

Implementation is complete. The accepted Phase 0 through Phase 9 checkpoints,
tracked impact declarations, and checkpoint ledger live under
[`docs/performance-baselines`](../performance-baselines/component-local-target-abi.md).

Post-acceptance compiler specialization may revise the target-local ABI when the runtime operation
surface changes. The compiler and runtime must advance the render-program ABI together so imported
or lazy package artifacts fail cleanly on a version mismatch. Version 7 includes compiler-selected
SSR attribute operations, immutable root attribute plans, fused root openings, and static native
numeric and boolean constants while retaining focused operations for spreads, target contributions,
dynamic values, custom-element properties, and behavior the compiler has not proven exactly.

The plan deliberately separates correctness work from performance collection. A benchmark is not
evidence merely because it completed. Results join the phase-to-phase comparison only after the
implementation and measurement are both known to be valid.

The framework-comparison project's specialist-review gate controls whether that project may publish
its results as framework-comparison evidence. It is not an implementation-phase gate for this
proposal. A correctness-gated, complete comparison run may enter an ABI checkpoint while its
independent publication status remains recorded as `non-publishable`.

## Operating rules

1. Correctness and structural validity gate performance measurement.
2. A known defect in the measured path stops a full measurement before it starts.
3. Focused measurements may be used within a phase to choose between valid implementations, but
   they do not become phase checkpoints.
4. Every completed phase receives one accepted full-suite checkpoint before work proceeds to the
   next phase.
5. Every accepted checkpoint publishes the complete result tables. Metrics, percentiles,
   frameworks, or counter-metrics are never omitted because they are unchanged or unfavorable.
6. Each checkpoint is compared with both Phase 0 and the immediately preceding accepted
   checkpoint. If a phase has no accepted checkpoint, the next valid result keeps the gap visible
   and compares with the last accepted checkpoint.
7. A benchmark or fixture change breaks the comparison lineage unless the preceding revision is
   measured again with the new harness.
8. Raw samples and environment metadata remain authoritative. A summary table is not a replacement
   for the evidence that produced it.
9. Historical eXact values are never rewritten. Reports may add an explicitly estimated
   `Exact before, normalized` value derived from unchanged comparison frameworks in the current
   run.
10. Performance evidence is an implementation control. Expected metrics must move for the expected
    reason, and supposedly unaffected metrics should remain stable within their declared noise
    bounds.

## Measurement states

Every attempted measurement has exactly one of these states:

| State      | Meaning                                                                                            | May enter the phase series? |
| ---------- | -------------------------------------------------------------------------------------------------- | --------------------------- |
| Diagnostic | A focused run answers a named implementation question after the affected behavior is correct.      | No                          |
| Accepted   | The phase exit gate, correctness gate, environment gate, and complete suite all passed.            | Yes                         |
| Invalid    | A known defect, setup failure, incomplete output, environment change, or contract variance exists. | No                          |

An invalid result is recorded only as an attempted run with its reason. Its timings are not
reported alongside accepted values and are not used to claim a regression or improvement. A
failed setup is not converted into a slow sample. A phase with a known defect is marked
`measurement not attempted` until the defect is fixed rather than spending time collecting values
that cannot be accepted.

## Evidence locations

Phase 0 establishes the concrete result schema and automation before implementation begins. The
series should use these repository-owned locations:

- `docs/performance-baselines/component-local-target-abi/phase-<n>.json` for the accepted,
  machine-readable checkpoint, including environment, revisions, harness identity, raw samples,
  summaries, and structural counters;
- `docs/performance-baselines/component-local-target-abi.md` for the human-readable checkpoint
  ledger and full tables; and
- `.tmp/component-local-target-abi/` for provisional and invalid runs that have not been accepted.

Accepted JSON must be sufficient to regenerate the Markdown tables. The generator must fail on a
missing metric, percentile, participant, sample population, environment field, or structural
counter instead of silently producing a partial report. Existing tracked baselines remain the
general release reference; this series preserves the more granular before/after history for this
proposal.

## Checkpoint identity and comparison lineage

Each accepted checkpoint records:

- the phase and checkpoint identifier;
- repository revision plus the exact worktree patch identity when the checkpoint is not at a clean
  commit;
- lockfile hash and benchmark-harness hash;
- Node, Bun, Chromium, operating system, CPU, memory, power mode, and relevant environment values;
- production build hashes and emitted artifact hashes;
- sample and warmup counts;
- correctness commands and results;
- structural-report counters;
- all raw samples and computed p50/p75/p95/p99 values; and
- per-metric control-framework ratios, normalization factors, dispersion, and confidence labels;
- V8 functions parsed and compiled, both through semantic readiness and before FCP, alongside
  coverage-derived profiled and invoked function counts;
- any declared limitation or contract variance.

The intended workflow uses one committed phase revision per checkpoint. A dirty worktree is not
automatically invalid, because unrelated user work can coexist in the repository, but the measured
patch must be captured and must not change between correctness validation, build, and measurement.

If the harness, fixture behavior, workload, dependency lockfile, runtime major version, browser
build, or machine changes, do not compare the new result directly with the old series. First check
out the preceding accepted implementation and measure it under the new conditions. That paired run
becomes the bridge baseline, and the report states that the lineage was rebased.

Control-framework normalization does not repair an incompatible lineage. It estimates ordinary
machine-state variance only after the harness, fixture behavior, dependency set, runtime versions,
and scenario contract have passed the lineage check.

## Control-framework normalization

Each phase report includes an estimate of how the preceding accepted eXact implementation would
have measured under the current run's machine state. The estimate uses the unchanged non-eXact
frameworks as controls for the same scenario, metric, and percentile.

For each eligible metric and control framework `f`:

```text
controlRatio[f] = controlCurrent[f] / controlBefore[f]
controlFactor = geometricMean(controlRatio[f])
exactBeforeNormalized = exactBeforeRaw * controlFactor
```

The geometric mean treats proportional increases and decreases symmetrically and avoids allowing
the framework with the largest absolute units to dominate the estimate. For example, if the
controls' latency values are collectively 2% higher in the current run, the factor is approximately
`1.02`, and a prior eXact latency of `100 ms` is shown as an estimated `102 ms` in the current-run
environment. Dividing the current value by `1.02` would answer the different question of how the
current implementation might have measured in the prior environment.

Normalization follows these rules:

- calculate a separate factor for every scenario, metric, percentile, runtime, and throttle level;
- use only controls whose implementation, dependency inputs, produced behavior, and measured path
  are unchanged between the two checkpoints;
- require at least two eligible controls; otherwise show the normalized value as unavailable and
  compare raw values with an explicit limitation;
- retain and display every contributing control ratio, the aggregate factor, and a dispersion
  measure;
- define the dispersion thresholds and confidence labels in Phase 0 before using them to interpret
  a candidate result;
- label every normalized value as an estimate and never substitute it for the stored raw value;
- do not normalize deterministic quantities such as raw/gzip/Brotli bytes, DOM counts, marker
  counts, function inventory, emitted file counts, or stable response identity; and
- do not manufacture a factor for eXact-only metrics. Use a same-run paired eXact baseline when
  justified, or report the raw historical comparison as unnormalized.

The comparison implementation owns a built-in deterministic inventory for artifact and transferred
bytes, DOM shape, response size, code coverage, and V8 parsed/compiled/profiled/invoked function
counts. Report configuration may extend that inventory for suite-specific deterministic values, but
cannot accidentally opt those built-in metrics into control normalization. Timing, throughput, and
environment-sensitive memory measurements remain eligible for per-row control normalization.

The formula applies without reversing higher-is-better metrics. If current control throughput is
2% lower, its ratio and the estimated prior eXact throughput are also approximately 2% lower. The
report still labels whether an increase or decrease is favorable for each metric.

## Performance expectations as an implementation control

Before implementing each phase, add a phase-impact record to the performance ledger. Record the
expectation before seeing the phase result so the explanation cannot be fitted retrospectively.
For every material area, the record states:

- the implementation mechanism being added, replaced, or removed;
- the structural counter or profile evidence that will prove the measured fixture reached it;
- the metrics expected to improve, regress temporarily, or remain unchanged;
- the expected direction and, when existing evidence supports one, a range large enough to be
  distinguishable from noise;
- counter-metrics that would reveal shifted work or lost behavior; and
- the later phase that removes any intentionally retained duplicate or generic mechanism.

Performance then checks the implementation model, not merely its aggregate speed. The following
outcomes require investigation before accepting a checkpoint:

- an expected material improvement does not appear;
- an improvement appears in an area the phase should not affect;
- a regression appears outside the declared temporary costs;
- a supposedly stable metric moves beyond its noise bound;
- a structural counter says a path disappeared but code reachability, function invocation,
  allocation, or timing still behaves as if it remains;
- a timing gain is accompanied by contrary payload, memory, CPU, readiness, correctness, or
  lifecycle counter-metrics; or
- control frameworks disagree enough that the normalized comparison is not trustworthy.

An unexpected improvement is investigated as seriously as an unexpected regression because it may
indicate an unexercised path, missing work, changed fixture, or instrumentation error. Investigation
first confirms generated output, structural counters, fixture reachability, semantic settlement,
and profile attribution. Only then does it treat the movement as a real implementation effect.

The initial directional control map is:

| Phase | Primary expected movement                                                                                      | Areas expected to remain broadly stable                                        |
| ----- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| P0    | No production movement; reporting and evidence generation must stay outside measured output                    | All production runtime, payload, build-output, and behavior metrics            |
| P1    | Artifact/build shape and compiler workflow; temporary emitted-size or build-time cost is possible              | Client interaction, hydration, and SSR runtime until executable paths migrate  |
| P2    | Client component construction, prop-update latency/allocation, invoked functions, and direct-call profiles     | SSR and unrelated structural operations                                        |
| P3    | Client decoded/executed code, property and structural update work, allocations, and function reachability      | Server-only issuance costs and explicit foreign boundaries                     |
| P4    | Hydration readiness, attachment/traversal work, marker/DOM counts, mismatch recovery, and temporary heap       | Client update semantics after attachment and server generation                 |
| P5    | Node/Bun SSR latency, throughput, CPU, allocation, retention, first chunk, completion, and server reachability | Client-only mount and steady-state interaction                                 |
| P6    | Registry selection, lazy activation, replacement, cancellation, and dynamic-boundary code reachability         | Static component paths except shared code removed by the phase                 |
| P7    | Package-consumption parity, React-boundary reachability, island startup, and unused-boundary bundle size       | Native local-component behavior                                                |
| P8    | Largest expected generic-code, decoded/executed-byte, function, allocation, and parse/compile reductions       | Public behavior, navigation, paint, protocol identity, and semantic settlement |
| P9    | No intentional implementation movement; increased samples should narrow confidence in the final result         | All metrics except ordinary sampling variation                                 |

This map is a starting hypothesis, not permission to explain away a result. Each phase refines it
into concrete affected scenarios and metrics before implementation. If implementation discoveries
change an expectation, update the record immediately with the discovered evidence and before the
full measurement begins.

Phase 8 admission exposed two target-selection requirements that apply before measurement. First,
the package root and every narrow framework/runtime subpath must resolve into the same conditional
client or server module tree. Mixing a target-local root with untargeted subpaths creates duplicate
core graphs and invalidates both reachability and size measurements. Second, a request-local direct
SSR context frame must use server snapshot semantics directly; importing the durable/client context
implementation retains reactive objects, generic error state, and their process-level defaults in
otherwise compiler-closed server bundles. Direct frames preserve nearest-provider lookup and raw
value identity, while built-in error state is lazy and request-domain-owned.

Post-acceptance allocation profiling exposed a third server-target distinction. Opaque operations
remain the architecture at client, protocol, public-dynamic, and compatibility boundaries, but a
compiler-closed server call chain must not allocate an opaque handle merely to redeem it in the next
stack frame. Generated server code prepares target-private component, child-range, and keyed-child
carriers containing the already selected server ABI inputs. The server renderer consumes those
carriers directly without inspecting rendered shape, and they never enter reactive state,
serialization, or cross-target transport. Interactive intrinsic island fallbacks likewise lower to
prepared server render programs so event metadata does not reintroduce native intrinsic receipts.

The same profile showed that hydration publication should validate the authored payload graph once
and encode reactive collections during final JSON serialization. It must not build an encoded clone
solely to validate or measure it. Exact escaped UTF-8 byte limits remain part of the protocol gate.

## Full-checkpoint admission gate

Run a full checkpoint only when all applicable items below pass:

- the phase exit gate in the proposal is satisfied;
- the repository builds from the intended source state;
- focused compiler, runtime, hydration, SSR, lifecycle, and compatibility tests for the changed
  path pass;
- the correctness-only release sequence passes: `npm run release:check`,
  `npm run test:router-v63`, and `npm run test:e2e:theme`;
- the generated structural report contains the values required by that phase and no unexplained
  fallback, decline, adapter, or generic-path reachability;
- benchmark scenario assertions pass before timing;
- the production fixtures exercise the new path rather than a retained or accidental old path;
- output is deterministic where the existing measurement contract requires it;
- no known correctness, hydration, ownership, cleanup, request-isolation, security, or protocol
  issue affects the measured path;
- no benchmark-only instrumentation or optimization changes candidate behavior relative to the
  accepted baseline;
- the environment matches the active comparison lineage; and
- no task-owned Node, Bun, Chromium, PowerShell, compiler, or service process remains from an
  earlier run.

`npm run release:full` is intentionally not the admission command because that profile proceeds
directly from correctness into performance. `npm run performance:check` is the checkpoint command:
its npm prerequisite runs the correctness-only release sequence, Router v6.3, Theme Lab, and the
native compiler corpus before measurement. Any failure stops before the performance profile begins.
The performance profile then reuses that admitted build and runs only benchmarks, so correctness and
measurement remain sequential without repeating the build or TypeScript 7 compatibility work.

If any item fails, fix or explicitly resolve it first. Do not run the full suite just to see what
the numbers would have been.

## Full checkpoint procedure

For each completed phase:

1. Confirm that the phase-impact record was written before implementation and still matches the
   implementation being measured.
2. Freeze the candidate source state and record its identity.
3. Build and run the phase-specific focused checks.
4. Run `npm run performance:check` in isolation. Its npm prerequisite runs the full correctness
   admission gate and stops before measurement on failure.
5. Confirm from the prerequisite output that the structural report reaches the intended path and
   that no task-owned process survived into measurement.
6. Capture the complete outputs from the framework, reactive, compiler, theme, DevTools, and
   React-compatibility suites run by the benchmark-only performance profile.
7. Run the controlled framework comparison browser, 1x/4x/6x startup CPU, Node SSR, and Bun SSR
   tracks with their correctness gates and standard sample populations:
   - `npm run measure:development -w @exactjs/framework-comparison-suite`
   - `npm run measure:startup-cpu:development -w @exactjs/framework-comparison-suite`
   - `npm run measure:ssr:development -w @exactjs/framework-comparison-suite`
     These commands differ from the comparison project's publication commands only by allowing a
     correctness-gated run while participant review is pending. They retain `publishable: false` in
     the raw evidence; the ABI checkpoint generator records that status without treating it as a
     phase gate.
8. Validate sample counts, environment identity, deterministic artifacts, stable response hashes,
   counter-metrics, and absence of setup failures.
   Copy mutable runner output to a phase-specific immutable capture before report generation; the
   accepted report configuration must never point at a runner's reusable `latest` or release-output
   filename.
9. Calculate eligible control-framework normalization factors and reject any factor whose inputs
   fail the unchanged-control or dispersion rules.
10. Generate the complete current-run and eXact phase-delta tables, comparing the phase with
    normalized estimates for Phase 0 and the preceding accepted checkpoint where eligible.
11. Compare every declared affected and stable area with the phase-impact record.
12. Write the succinct improvement/regression summary and tie temporary expected costs to their
    concrete mechanism and removal phase.
13. Investigate every missing, displaced, or contrary movement, material regression, or suspicious
    gain. Repeat a lane only when there is an
    identified environmental or harness reason, and retain both the rejected attempt and the
    reason.
14. Accept the checkpoint only when the evidence is valid and observed changes agree with the
    implementation model or have a verified explanation. If implementation changes are required,
    return to correctness validation before measuring again.

Phase 0 and Phases 1-8 use the standard release sample populations. Phase 9 repeats the entire
matrix with 50 independent samples where the proposal requires them. A phase report must not mix
sample populations within a comparable lane.

## Required checkpoint output

After every accepted full measurement, publish a ledger row and the complete tables for that
result. The report begins with:

| Phase | Revision | Status   | Correctness gate | Structural gate | Environment | Result artifact |
| ----- | -------- | -------- | ---------------- | --------------- | ----------- | --------------- |
| P0    | recorded | accepted | passed           | recorded        | lineage A   | linked JSON     |

The current-run tables show every framework together so the control values and the eXact result are
auditable. They use the complete participant and percentile set produced by the relevant suite:

| Scenario     | Metric   | Percentile      | eXact current | Control A current | Control B current | Other controls |
| ------------ | -------- | --------------- | ------------: | ----------------: | ----------------: | -------------: |
| Complete row | measured | p50/p75/p95/p99 |         value |             value |             value |         values |

The eXact phase-delta tables then show both historical raw values and their current-environment
estimates:

| Metric and percentile | P0 normalized | Exact before raw | Control factor | Exact before normalized | Exact current | Delta vs normalized before | Delta vs normalized P0 |
| --------------------- | ------------: | ---------------: | -------------: | ----------------------: | ------------: | -------------------------: | ---------------------: |
| Complete metric row   | estimated/raw |            value |  factor or N/A |           estimated/raw |         value |             absolute and % |         absolute and % |

For deterministic and otherwise ineligible metrics, `Exact before normalized` equals the raw value
and `Control factor` states `not applied`. The P0 estimate uses the controls' P0-to-current ratios;
the immediate before estimate uses their preceding-phase-to-current ratios.

The report groups, but does not abbreviate, all metrics produced by the suites:

- browser navigation, readiness, interaction, FCP, LCP, long tasks, blocking time, and DOM counts;
- decoded and executed JavaScript, function inventory and invocation, parse, compile, evaluation,
  script, and task time;
- 1x, 4x, and 6x cold-start CPU results;
- retained heap, allocation, mount/unmount, and ownership signals;
- Node and Bun SSR latency, throughput, CPU, cold start, memory, retention slope, first-byte, and
  completion metrics;
- protocol and SSR payload raw/gzip/Brotli sizes;
- clean and incremental build timing and emitted raw/gzip/Brotli sizes;
- compiler, reactive, DevTools, theme, and React-compatibility benchmark results; and
- every framework-comparison participant and every common p50/p75/p95/p99 value.

Use `N/A` only when the suite defines that metric as inapplicable, and include the reason. A failed,
missing, or malformed sample is not `N/A`; it invalidates that lane. Reports may include a concise
interpretation after the tables, but the interpretation never replaces the full output.

Each accepted checkpoint ends with a brief summary containing only material changes:

- the most important improvements, with absolute and percentage changes against normalized before;
- the most important regressions, with the same comparison;
- whether each change occurred in the area and direction predicted by the phase-impact record;
- expected movement that did not occur and supposedly stable areas that unexpectedly moved; and
- for an expected temporary regression, the concrete retained mechanism and the phase that removes
  it.

For example: `Decoded client JavaScript grew by X bytes (Y%) because Phase 2 emits direct prop
receipt while the generic prop implementation remains reachable; Phase 8 removes that path.` This
kind of explanation is a tracked prediction, not a blanket exemption. If the named later phase does
not remove the cost, that phase reports the missed prediction as an unexpected regression.

Phase 0 defines materiality from the observed noise and metric consequence before later results are
known. Small indistinguishable movements may be summarized as no material change, but they remain
visible in the full tables.

## Focused measurements within a phase

A focused run is appropriate when two or more correct implementations have a meaningful cost
tradeoff, or when a profile is needed to locate a regression. Examples include prop receipt
encodings, child-local dirty routing, generated attachment shapes, hydration marker removal, SSR
issuance layout, or lazy-registry selection.

Before a focused run, record:

1. the question and hypothesis;
2. the alternatives being compared;
3. the focused correctness assertion that both alternatives pass;
4. the scenario, counter-metrics, sample population, and decision threshold; and
5. which result would change the implementation direction.

Use the narrowest production-shaped scenario that answers the question. Diagnostic options such as
`--scenario`, `--node-only`, a foundation scenario, allocation sampling, or a targeted CPU profile
are appropriate here. Report every metric collected by that focused run, label it `diagnostic`, and
record the resulting decision. Do not update a tracked phase checkpoint, general framework
baseline, or proposal target from a focused run alone.

Do not measure an alternative known to be incorrect merely to quantify how fast the defect is. If
the focused test exposes a correctness, reachability, or measurement problem, stop the run and fix
that problem before continuing the experiment.

## Initial workstream map

The proposal's [current source anchors](component-local-target-abi.md#current-source-anchors) are
the detailed starting points. The initial ownership map is:

| Workstream                     | Primary repository areas                                                                                                                                                       |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ABI and durable instance       | `packages/core/src/component-contracts.ts`, `packages/core/src/component-definition-contracts.ts`, `packages/core/src/component-contract/`, and `packages/core/src/component/` |
| Compiler analysis and emission | `packages/compiler/src/native/`, `packages/compiler/src/transform/`, and `packages/compiler/src/contracts/transform.ts`                                                        |
| DOM construction and updates   | `packages/dom/src/renderer/` and `packages/dom/src/runtime/`                                                                                                                   |
| Hydration and recovery         | `packages/hydrate/src/runtime/`, `packages/hydrate/src/root.ts`, and the hydration response/patching modules                                                                   |
| SSR and request-local frames   | `packages/ssr/src/render/`, `packages/ssr/src/runtime/`, and target adapters                                                                                                   |
| Dynamic component registries   | `packages/core/src/component-registry/` and compiler registry lowering                                                                                                         |
| Libraries and publication      | package build adapters, compiler package emission, publication checks, manifests, and component-library fixtures                                                               |
| React ownership boundary       | `packages/react-compatibility/`, `packages/react-dom-compat/`, `packages/react-compat-adapter-api/`, and `react-adapters/`                                                     |
| Structural/performance proof   | `scripts/`, `docs/performance-baselines/`, and `framework-comparison/`                                                                                                         |

These areas are starting points, not permission to preserve existing module boundaries. Each phase
should move behavior to the package that owns the new contract and remove obsolete imports at the
source rather than adding cross-package forwarding layers.

## Implementation phases

### Phase 0: Observability and reproducible baseline

Implement the structural reporter specified by the proposal and make its schema stable enough to
serve every later gate. Add the checkpoint generator, completeness validation, comparison-table
generation, control-framework normalization, dispersion/confidence rules, environment capture, and
invalid-attempt recording. Define the phase-impact record schema, materiality rules, and initial
directional control map. Confirm that each performance fixture is production-compiled and identify
which structural categories it exercises.

Run the full correctness gate and collect P0 only after the reporter and harness validation pass.
The existing figures in the proposal are directional context; P0 is the authoritative same-lineage
implementation baseline.

**Checkpoint trigger:** the reporter distinguishes native execution from explicit React, plugin,
and test boundaries; the result generator rejects partial evidence; all baseline fixtures pass.

### Phase 1: Target ABI contracts

Define cohesive client and server ABI modules, their generated artifact representation, inert
analysis metadata, continuations, authorization records, and build-time validation. Migrate all
artifact producers and readers in one slice and delete the prior ABI rather than adding an adapter.
Add malformed, obsolete, cross-package, and target-mismatch coverage.

Use targeted compiler/build measurements only if artifact shape or validation placement presents a
real implementation choice.

**Checkpoint trigger:** every native export has exactly one current target ABI, every repository
consumer uses it, obsolete artifacts fail at their owner boundary, and no compatibility adapter is
reachable.

### Phase 2: Direct client component composition

Lower static and imported component tags to direct target-ABI references. Implement allocation-free
prop key/value receipt, receiver-owned prop storage and dirtiness, one atomic child apply, and
observable absence. Move construction, attachment, and disposal behind the artifact. Migrate native
roots and remove the generic function-component lane in the same phase.

Focused measurements should compare viable prop receipt encodings and operation dispatch shapes.
They must include unchanged props, sparse changes, multi-prop batches, repeated keys, component
creation, steady-state updates, and allocation counter-metrics.

**Checkpoint trigger:** native mounts cannot reach generic construction, `renderInstance`,
component-wide rerendering, or generic child normalization for native component dispatch; parent
output contains no child dirty mask or operation routing; lifecycle and batched-prop tests pass.
Focused structural operations used by component interiors scheduled for Phase 3 may still reconcile
authored dynamic child values. They must already invoke any native component value through its
target ABI and must not classify or execute it through the removed function-component lane.

### Phase 3: Exhaustive component interiors

Complete component-local lowering for every currently valid source form listed by the proposal.
Inventory each former decline reason, add semantic and generated-output coverage, select the
smallest focused operation needed by that source, and remove the decline path as its replacement
lands. Do not narrow valid authored TSX to make the report reach zero.

Use targeted runs when choosing a representation for a high-frequency structural operation. Pair
latency with code reachability, emitted size, function count, and allocation so work cannot merely
move to another metric.

**Checkpoint trigger:** the compiler corpus, packages, and applications report zero declined native
JSX regions and zero generic property groups without losing source coverage.

### Phase 4: Mount, hydration, and recovery

Unify client-only mount and hydration through generated attachment. Give artifacts ownership of
claims, controls, events, child ranges, and mismatch recovery. Remove redundant markers only after
identity, focus, selection, form control, corruption isolation, and replacement behavior are
protected.
Any client-selected focused component-output range must have matching server topology. The server
emits the boundary for hydration identity; it does not install the client subscription or inspect
the opaque output to decide what crosses it.

Targeted hydration runs may evaluate marker and path representations after matching, mismatch, and
recovery assertions pass.

Compact marker identities must be derived from the target-independent marker topology, not from a
client- or server-specific general slot index. A compiler-proven markerless root must carry an
explicit hydration-payload proof, continue to recognize nested markers as nested ownership, and
exclude its hydration metadata script from the component output range without removing that script
from the document.

**Checkpoint trigger:** matching hydration has no generic native traversal, recovery enters the
specialized mount method, and client-only roots use the same ABI.

### Phase 5: Server issue/write/dispose execution

Emit request-local issuance, serialization, and disposal for every native server artifact. Compose
children directly across modules and packages, preserve dependency-driven task start and authored
publication order, and migrate synchronous, scheduled, resumable, continuation, Node, and Bun
modes. Delete each superseded generic server lane with its migration.

Targeted runs may compare request-frame or write representations, but must retain response identity,
task concurrency, cancellation, first-chunk, completion, CPU, allocation, and retention
counter-metrics.

**Checkpoint trigger:** supported native SSR imports no generic component runtime, creates no
client-style durable instance, and passes request-isolation and scheduler invariants on Node and
Bun.

### Phase 6: Dynamic selection

Compile static, finite, and lazy registries as selection among already compiled ABIs. Preserve key
identity, same-key instances, owned ranges, cancellation, generation fences, and stale-load
rejection. Keep open external ownership behind its explicit supported boundary without runtime
native component classification.

**Checkpoint trigger:** all supported dynamic source forms pass and no native selection path
performs runtime component-kind or execution-lane classification.

### Phase 7: Libraries and React compatibility

Publish target executables with inert analysis metadata and validate nested consumption without
dependency source inspection. Replace runtime-created React adapters and roots with precompiled
island artifacts, and use artifact handles when native children cross React ownership. Exercise
package manifests, published contents, bundlers, React conformance, and unused-boundary
reachability.

The React-crossing handle is an opaque capability for a supplying component's compiled child-range
operation. It is not a VNode wrapper or a second child interpreter: it exposes no kind or topology,
cannot materialize a VNode, and covers text, intrinsics, components, collections, and empty output
without classification by the island. The supplying operation retains attachment, update,
identity, activity, and disposal ownership and calls a nested component's target ABI when one is
present. React compatibility may retain React-private elements and renderer state, but its island
and root artifacts must not import eXact VNode factories or return eXact VNodes to a native
renderer; their attachment methods enter the separate React renderer directly.

Run React conformance against built package entry points as well as source tests. Fixed islands can
load beside target-local core copies while renderer bridges use narrow core subpaths, so built-in
error, logging, suspension, and readiness contexts must use realm-stable identities across those
copies. The React renderer must also distinguish a committed Suspense fallback from retained
primary content when deciding whether a transition remains pending, and its SSR serializer owns
the certified React-version-specific host markup differences.

**Checkpoint trigger:** imported components use the same ABI as local components; React support is
absent when unused and requires no generic native execution when present.

### Phase 8: Removal and consolidation

Delete the remaining native generic construction, rendering, rerendering, property binding, server
lanes, executable fallback data, and production artifact factories. Move legitimate foreign and
test-only machinery to explicit entry points. Consolidate modules around ABI ownership rather than
preserving transition structure, then run source-architecture and reachability audits.

During consolidation, use **component operation** for the opaque compiler-issued invocation that
crosses the target ABI and **prop receipt** only for an atomic delivery of finalized parent-owned
prop values. Migration-era implementation names containing `ComponentReceipt` denote the former;
they do not expose or describe the component's rendered node shape.

Do not measure while a known transition path remains. Size improvements collected before the
structural zero report would be incomplete and potentially misleading.

Application-root assembly is a build-adapter responsibility in this phase. The compiler publishes
component-local facts beside emitted code; the adapter joins them to each bundler entry's resolved
module graph, supports any number of mount or hydration roots, emits the executable registrations
needed by those roots, and erases the descriptive inventories. Compiler `root` implementation roles
and artifact-graph `exposureRoots` are component/module exposure terms, not application-root
discovery.

The build graph identifies application entries, while the compiler retains ownership of each
authored mount expression inside those entries. It selects a component, render-program, or
intrinsic root ABI from the operation it emitted, including through immutable local aliases and
parentheses. Compiled TSX must never fall back to an undifferentiated public render call merely
because the application root is not itself a component.

Root and nested component-domain replacement use the same scoped parking transaction. Operations
owned by a foreign domain are removed from the retiring ownership tree before teardown and are
reclaimed only by a matching opaque operation in the replacement tree, preserving the foreign
instance and its lifecycle without exposing its rendered shape.

**Checkpoint trigger:** every native fallback category is zero, forbidden modules and imports are
unreachable, and the complete repository acceptance surface passes.

### Phase 9: Final verification and acceptance

Perform the proposal's comprehensive compiler, package, application, publishing, platform,
hydration, SSR, continuation, React, browser, Node, and Bun verification plus a fresh adversarial
source audit. Run the full comparison matrix with 50 independent samples, retaining the same
scenario definitions and environment lineage as P0-P8.

For SSR comparison checkpoints, rotate the participant execution order, warm and record the shared fixture
service before each participant, and use sustained fixed-duration saturation windows. Retain complete
per-framework request populations even when their counts differ. Publish the ordinary end-to-end tables
together with worker-phase, equal-payload, payload-size sweep, preloaded render-only, and Node allocation-site
diagnostics. Treat these lanes as attribution evidence: they may explain a throughput difference, but they do
not replace the production-route result. Any unexpected change requires an explanation tied to the relevant
counter-metrics before the checkpoint is accepted.

**Checkpoint trigger:** all proposal acceptance invariants pass, all intended removals are proven,
all full tables are published, and every material regression is understood and either resolved or
explicitly accepted against the architectural benefit.

Post-acceptance profiling may replace a general reactive wrapper only when the compiler proves the
operand is exactly one indexed state or props slot after all form, control, and transport
projections. The emitted descriptor reuses that slot's dependency source and must carry the same
slot identity into component update planning. Derived expressions and structural ranges retain
their computation owner. Profile such a change against normalized controls; deterministic code and
function inventories remain raw, unnormalized evidence.

The accepted intrinsic-property slice stores exact state and prop operands in the existing
component-local `wire`. A mixed property group keeps its arbitrary-expression writer, while the
focused property operation reads only its proven indexed subset. Dirty updates recover that same
immutable tuple from the selected operation instead of retaining descriptor arrays on component
instances. No capture, callback, derived expression, or spread is converted into operand data.

The receiver-owned indexed input plan may likewise accept an exact property path below one indexed
prop slot when a finalized replacement of that root prop is the path's complete invalidation
identity. The plan reevaluates the authored optional/property chain inside the receiving component
and preserves setup order. Authored calls, multiple roots, derived values, asynchronous work, and
observable nested mutation retain their computation or task owner.

Post-acceptance server specialization may fold a compiler-proven synchronous returned render arrow
into the component's server implementation. The artifact marks that closed form, and the request
executor runs setup and writes the resulting prepared program into the request-owned sink without
creating a returned render closure, issued synchronous result, snapshot projection, or parallel
fast path. Forwarded and arbitrary output remains callable until the compiler can prove an equally
complete lowering. Scheduled components retain their issued protocol. This specialization must
preserve request-local checkpoints, rollback, hooks, disposal, child artifact dispatch, response
identity, and resumption publication.

Once that direct lane is exclusive, the synchronous renderer also owns setup, local-program
execution, checkpoint publication, lifecycle cleanup, and boundary formatting without calling a
generic synchronous executor with an allocated sink callback. Delete that executor and its sink
type; do not keep them as a compatibility route. The asynchronous renderer and scheduled
stabilization protocol remain separate owners.

Compiler-closed artifact roots construct the same indexed request-owned resumption capture without
installing the ordinary renderer's instance-to-token `WeakMap` or generic component-observation
wrappers. Authored attempt and observation hooks remain present, while direct and scheduled
executors publish through the capture ABI themselves. Generic and extensible render entrypoints
retain the instance bridge for values crossing those renderer boundaries.

A transition-free direct component whose complete captured state is recreated by exact finalized
inputs or unconditional primitive defaults does not need a resumption contract or an empty value
record. The compiler omits both target artifacts' resumption surface for that component. Components
with continuations, server lifecycle, contexts, arbitrary setup values, or an uncovered state path
retain indexed request-owned capture and ordinary hydration validation.

The document hydration lane preserves those indexed capture pairs through bounded decoding. Once
the receiving client artifact is known, its resolver validates and replaces each request-owned
numeric field cell with the matching immutable schema name. State and context activation iterate
the same pair arrays, removing the transitional `@index` record and the subsequent named-record
projection. Public application-supplied registrations remain named records, and both lanes retain
the same undeclared-field, duplicate-alias, continuation, ordering, and rollback checks.

Compiler-proven finite root-prop shapes may likewise carry one immutable positional schema on each
target artifact. Hydratable publication encodes only exact plain-object and dense-array matches;
the component identity travels with the positional values, and the client reconstructs the named
request-owned graph only after selecting that same artifact. Open shapes, mismatches, accessors,
output extensions, and unsupported values retain named publication. The generic JSON safety and
resource-limit boundary remains authoritative and constructs the positional cells during that same
source traversal; module artifacts never retain request values.

A later focused specialization may also issue a statically selected child directly from that
program when its invocation consists only of finalized plain props. Store the callable in the
immutable generated writer, keep props request-owned, and reuse the existing child artifact ABI.
Do not extend this form to authored children, keys, enhancements, spreads, dynamic or lazy
selection, or deferred publication; those forms retain their prepared component operation.

A synchronous compiler-closed response may additionally use a produced response body owned by the
server package. Request-scope disposal transfers to that body and occurs after successful adapter
consumption, renderer or transport failure, cancellation, or host abort. The Node adapter collects
settled spans as a string rope and performs one terminal write; it must not call the HTTP response
once per compiler span or introduce array joins, native-buffer copies, or Web-stream encoding into
this synchronous lane. Its produced-body claim may also supply an immutable allocation-free UTF-8
byte-length operation, allowing the request sink to use `Buffer.byteLength` without importing Node
or materializing encoded buffers. Fetch-compatible adapters consume the same body contract through
their native response representation and retain the portable exact scanner when they lack such an
operation. This checkpoint does not replace the scheduled artifact writer:
genuine progressive output requires an asynchronous writer that awaits coarse transport
backpressure and has an explicit post-commit failure protocol.

## Phase progression and regressions

A phase is not complete merely because its implementation and tests pass. It is complete after its
accepted checkpoint is published. If a full run uncovers a regression:

- first determine whether it is implementation, environment, harness, or statistical noise;
- use a focused reproduction or profile when that can answer the question more cheaply;
- fix implementation defects and restart from the correctness gate;
- remeasure the preceding revision when comparison lineage changed; and
- document an intentional tradeoff only after all counter-metrics are available; and
- verify that every temporary expected regression from an earlier phase is removed by its named
  phase or reclassify it as unexpected.

An unexplained regression blocks the next phase. A knowingly invalid run does not. It is simply not
performed or not accepted, and the implementation work continues at the current phase until a valid
checkpoint is possible.

## Documentation during implementation

Each phase updates the proposal status, current engineering references, performance ledger, and any
package README or package-local agent guide whose application-facing purpose or limits changed.
Public documentation under `apps/docs` changes only when implemented public behavior, guarantees,
or supported source forms change. Internal ABI mechanics remain in engineering documentation.
