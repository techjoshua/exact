# Retained SSR profiles, September 10, 2026

After rejecting the document-host callback experiment, the restored application artifact exactly
matches the retained static-input reuse build. Fresh profiles cover that build and React on Node
and Bun, each in a separate production process, with 100,000 small-document string renders after
warmup. Both applications own the full document and render four asset tags. React loads from its
participant directory to preserve dependency resolution. CPU sample shares are diagnostic;
they are not throughput comparisons or measures of allocated bytes.

Frames are aggregated by function name and source location across call contexts. Node eXact
has 2,398 samples and React 1,868. Bun eXact has 498 samples and React 473, making its smaller
shares particularly coarse.

| Sampled function           |        Node eXact |                 Bun eXact |
| -------------------------- | ----------------: | ------------------------: |
| JSON serialization         |             5.25% | 2.21% in native stringify |
| Positional validation      |             4.71% |                     4.42% |
| Document detection         |             4.09% |                     8.03% |
| Prepared program creation  |             3.34% |         Not among top ten |
| Component-prop preparation | Not among top ten |                     3.61% |
| Text escaping              | Not among top ten |                     3.61% |

Node eXact's garbage-collector samples are 10.72%. That share does not prove a leak or quantify
avoidable allocations. React's largest Node frames are retryNode (9.90%), Document (7.60%),
push (7.17%), and escapeTextForBrowser (6.21%). Bun React's largest frames are push (19.24%),
renderElement (13.11%), and renderNodeDestructive (6.34%). Differently sized sample populations
and runtime attribution prohibit treating share differences as absolute time savings.

## Source audit and implications

The hydration serializer still combines JSON.stringify with script-safe escaping. Earlier
escaping-guard experiments already tested alternatives; this profile alone does not warrant
repeating those experiments. Document detection can force a rope to flatten, but earlier
finalization experiments merely moved that work to response consumption. Removing its frame
from a profile would not by itself establish a throughput improvement.

The positional object validator enumerates keys to verify field count, then checks current own
property membership before reading each field. Reusing the earlier key list to skip membership
checks is unsafe: an earlier getter can delete a later property. The source comment and prior
hydration-request-path experiment record that contract. This shortcut is excluded from further
experimentation unless a separate proof of immutable input is available.

State capture already omits values equal to compiler-known defaults and values recoverable from
props. A proposal to simply stop publishing unchanged default state would duplicate existing
behavior. The next hydration experiment must identify additional work actually performed by the
current implementation, without relaxing accepted-value rules or ownership checks.

Raw profiles, worker results, summarizer, runner, and the profiled eXact artifact are preserved in
static-input-profiles-2026-09-10-evidence.zip. The overall performance objective remains unmet;
the latest measured HTTP comparison is in static-server-invocations-2026-09-10.md.
