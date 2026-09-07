# Request-scope experiments, 2026-09-06

Raw captures referenced in this note are local experiment artifacts and are excluded from Git.
Published chart data is retained under `apps/docs/src/data`.

Keep the empty-ownership disposal shortcut in `packages/server/src/context/scope.ts`. Reject lazy
ownership/dependency maps. The retained change makes empty-scope disposal cheaper; native endpoint
HTTP gains are small and uncertain. The raw evidence (local capture: `request-scope-experiments-2026-09-06.json`)
includes ordered samples, environment metadata, frozen scope-module sources and hashes, and runners.

## Find the responsible path

The controlled five-framework comparison loads session and incident data through shared benchmark
code for eXact and React. Optimizing that loader would not establish an eXact framework improvement.
This experiment therefore measures the native Node adapter and server context runtime separately.
It does not replace or reinterpret the public five-framework charts.

The baseline includes the previously retained response-getter and UTF-8 improvements. Server package
outputs were frozen before this experiment. Baseline and candidate Node adapters have identical
implementation and differ only in which frozen server package they import. Shared dependencies and
the protocol fixture stay the same.

## Retained implementation

`ContextScope.dispose()` marks the scope disposed, then checks whether it owns any factory-created
values. An empty ownership map requires only clearing the resolved-value lookup and returning.
Previously it also constructed the failure list, dependency traversal sets, creation-order list,
and traversal callback, then traversed provider order even though no resources could be released.
The normal factory-resource cleanup path remains intact.

Request lifetime cancellation still belongs to the surrounding runtime. Plain supplied values
remain externally owned; application context persists across child request disposal. Factory
initialization, dependency order, late-value disposal after abort, and cleanup failures retain their
existing contracts. There is no compiler, ABI, public API, or authoring-syntax change.

## Methods and results

### Context lifecycle screen

Four fresh process populations each warm 2,000 request scopes per case and variant, then run 20
balanced rounds of 1,000 open/read/dispose operations. Cases use no custom context, one plain value,
or one synchronous factory with a disposer. The cleanup-only change improved plain-value lifecycle
time in all four populations; empty and factory timings were mixed. All timings include the normal
request runtime's headers, request value, signals, initialization, and cleanup.

A followup isolates the changed operation in one process: construct 10,000 empty scopes outside
the timed interval, collect garbage, then await each disposal. Four discarded rounds precede 30
balanced paired rounds. Baseline averaged **0.561 µs/disposal**, candidate **0.248 µs/disposal**,
about **56% lower**, saving approximately **0.31 µs**. This is a microbenchmark of disposal, not an
equivalent percentage reduction in request time or retained heap.

### Native HTTP confirmation

Each of four fresh process populations runs baseline and candidate native Node endpoints. Requests
are real JSON POST invocations through `createExactNodeHandler`, body parsing, allowlisted protocol
dispatch, context lookup, response publication, and request cleanup. All variants return the same
text patch. Every response is checked for meaningful content and identical bytes/hash outside its
timed interval.

Each worker/case receives a discarded two-second c32 prime. Sequential measurement uses 20 balanced
rounds of ten requests, followed by 20 balanced 500 ms sustained c32 windows per case and variant.
There are 800 sequential requests and 80 capacity windows per case/variant across populations.
Aggregate RPS includes final response drain. No controlled API or database work is simulated.

| Context case      | Baseline RPS | Cleanup-only RPS |                Change | Baseline sequential mean | Candidate sequential mean |
| ----------------- | -----------: | ---------------: | --------------------: | -----------------------: | ------------------------: |
| No custom context |      7,862.9 |          7,952.3 |                +1.14% |                 0.275 ms |                  0.274 ms |
| One plain value   |      7,657.3 |          7,742.1 |                +1.11% |                 0.273 ms |                  0.271 ms |
| One owned factory |      7,504.0 |          7,503.9 | effectively unchanged |                 0.302 ms |                  0.288 ms |

Do not treat the aggregate percentages as established deployment gains. Empty-context RPS moved by
+4.2%, +3.3%, -7.3%, and +4.2% across populations. Plain-value RPS moved by +4.4%, +0.6%, -6.9%,
and +6.4%; factory RPS moved by +2.3%, -2.3%, -7.7%, and +8.2%. Shared movement across cases,
including the unchanged factory cleanup path, shows that process effects and workstation activity
remain substantial. Interleaving reduces shared drift but cannot remove those effects. The focused
disposal result and simpler empty path justify retaining the change; HTTP evidence is inconclusive.

### Rejected lazy-map variant

Allocating ownership and dependency maps only upon resolving a factory saved approximately
365–375 bytes per live plain request scope. That retention diagnostic used four balanced rounds,
5,000 simultaneously open scopes per case/variant, and explicit GC. Factory-backed scopes retained
essentially the same memory. The lifecycle screen improved most plain-value and empty cases.

However, a separate four-population native HTTP run measured aggregate factory-context throughput
of **7,701.6 RPS baseline versus 7,452.0 RPS candidate**, down **3.2%**, with declines in three of four
populations. Empty and plain-value aggregate throughput also failed to improve. The lazy maps were
restored to eager allocation rather than trading a measured factory-path concern for lower retained
memory. The retained cleanup shortcut does **not** claim the rejected variant's heap savings.

## Validation and limits

The lifecycle tests cover closure of empty and plain-value scopes, repeated disposal, abort reason,
removal from the resolved-value lookup, and survival of application context into the next request.
Existing tests cover factory dependency ordering, concurrent reads, cycle rejection, abort during
initialization, late resource disposal, and response-owned request lifetimes.

All 374 server, SSR, and Node-adapter tests passed. Server package compilation, documentation
type checking and standalone build, JSDoc, package-content, formatting, and diff-whitespace checks
also passed.

Builds, tests, and profilers did not run alongside timed benchmarks. Both HTTP captures closed and
reaped their owned Node workers. This evidence covers a small native protocol endpoint and isolated
context operations; it does not measure database-heavy requests, page SSR, browser startup, browser
heap, Bun, or framework rankings.
