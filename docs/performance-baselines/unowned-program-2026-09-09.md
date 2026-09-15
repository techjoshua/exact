# Skip empty prepared-sibling cleanup scopes

Date: 2026-09-09. Retained in production.

Prepared server programs previously entered withRenderCleanup even when sibling preparation
returned no owned resources. The operation target now returns directly through renderProgramOutput
in that case. Programs owning prepared siblings retain the existing cleanup path. Descendant
ownership, document host unwinding, and error propagation remain in their owning render operations.
This removes two callback constructions and empty cleanup dispatch at each affected call site;
it does not remove any resource disposal. It does not establish direct-to-sink traversal.

The hypothesis was a modest improvement most visible with many compiled programs. Thirty-two
fresh production processes compare the frozen text-surroundings control with this isolated change:
Node/Bun, string/consumed stream, three/96 incidents with four assets, two reversed-order pairs.
Each process uses 5,000 warmups and 12,000 measured renders. Full application-owned documents and
hydration hashes match in every pair. No completed population was discarded. These are local
renderer timings, not HTTP throughput; two pairs do not establish confidence intervals.

Positive percentages mean slower rendering.

| Runtime | Mode   | Fixture | Pair 1 time change | Pair 2 time change |
| ------- | ------ | ------- | -----------------: | -----------------: |
| node    | string | small   |             -4.58% |             -0.48% |
| node    | string | large   |             -6.21% |             -1.66% |
| node    | stream | small   |             -2.28% |             -1.38% |
| node    | stream | large   |             -5.23% |             -0.25% |
| bun     | string | small   |             -1.22% |             -1.34% |
| bun     | string | large   |             -1.31% |             -1.14% |
| bun     | stream | small   |             -2.79% |             +0.09% |
| bun     | stream | large   |             +1.43% |             -1.70% |

String rendering improved in both pairs of every cell. Node streaming also improved in both
pairs. Small Bun streaming was better once and essentially unchanged once; large Bun streaming
was mixed. Retention is based on simpler ownership handling and these measured results, without
claiming a universal improvement. React was not rerun, so its preceding comparison remains dated.

Validation: 288 SSR tests in 45 files, including new synchronous/asynchronous child-failure
host-unwinding checks; test type checking; changed-file lint; source architecture; platform
boundaries; compiled ABI fixtures; initial release ABI epoch 1; package contents. Existing SSR
tests cover scheduled sibling issuance and component cleanup. Client, Node server, and Bun server
builds completed. The client artifact remains index-CdIXDKwS.js.
The rebuilt Node entry is byte-for-byte identical to the timed candidate.

Browser correctness checks passed for both frameworks in Node/Bun and string/stream, 14 per cell,
56 total. These are interaction/hydration checks, not new browser performance timings.
Engineering documentation now describes the cleanup ownership rule. Public APIs and authored
usage are unchanged, so no package README or docs-app edits are needed.

The adjacent evidence ZIP contains raw measurements, both frozen artifacts, source snapshots,
scripts, browser logs, and a verified SHA-256 manifest. Validation command summaries here reflect
successful tool output; raw transcripts for every package check are not included.

The broader direct-sink implementation and React parity goal remain incomplete.
