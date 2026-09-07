# Matched-artifact eXact / React gap audit, 2026-09-06

Raw captures referenced in this note are local experiment artifacts and are excluded from Git.
Published chart data is retained under `apps/docs/src/data`.

The earlier focused capture showed a 0.9% React throughput lead; the subsequent full capture showed
4.7%. Comparing the latter with an even older published baseline did not resolve that discrepancy.
This audit tests the actual earlier renderer against the current renderer and unchanged React.

The raw audit archive (local capture: `exact-react-gap-audit-2026-09-06.json`) contains all ordered samples, population
summaries, artifact identities, runner sources, and shared worker/client/statistics sources.

## Artifact identity and scope

The frozen `.tmp/buffered-accounting/baseline.mjs` is 244,801 bytes. Combined with the two unchanged
compiler audit files, its artifact hash is
`de224d951229b7ab39b080c4a8ceaeece891e17afb34adecd5d3d4b60228acc7`, exactly matching the
[earlier focused capture](exact-react-ssr-2026-09-06.md). React's artifact hash also matches that
capture: `f3284aec0b40af3611a7307cd6714971cbb87b85a9c79f73ebc445fb48f6e820`.

The current eXact renderer is frozen separately from the working tree. Both eXact renderers use the
same current production Node worker, adapter, and controlled data service. Their bundled framework
implementations are self-contained. This isolates accumulated renderer/compiler changes, rather than
reconstructing the entire historical transport environment. Artifact identities are checked before
and after every complete run. Every response must retain its expected content hash, byte count,
and meaningful incident content.

## Focused three-way comparison

Four fresh worker populations use the earlier focused method: two-second c32 priming, 500 sequential
requests, 50 finite 16-request bursts, another two-second prime, then 50 interleaved 500 ms c32 windows
per participant. Orders rotate and reverse. Requests load the controlled service normally; this is
not a preloaded renderer diagnostic. Totals include final drain; validation follows each timed window.

| Population | Old eXact RPS | Current eXact RPS | React RPS |
| ---------- | ------------: | ----------------: | --------: |
| 1          |      2,459.01 |          2,513.44 |  2,489.63 |
| 2          |      2,446.74 |          2,499.15 |  2,499.11 |
| 3          |      2,446.51 |          2,505.24 |  2,477.33 |
| 4          |      2,520.63 |          2,523.80 |  2,495.01 |
| Combined   |      2,468.24 |          2,510.40 |  2,490.27 |

Current eXact improves on old eXact in all four populations, by 1.71% in aggregate, and averages
0.81% above React. Each participant receives 200 timed windows and more than 250,000 verified
capacity responses. Mean sequential latency is 0.760 / 0.757 / 0.748 ms for old/current/React;
mean burst completion is 7.734 / 7.613 / 7.419 ms. Near-matched capacity does not imply identical
latency or a universal eXact lead.

## Broader participant inventory

A second four-population run adds SvelteKit, Nuxt, and TanStack Start to the same interleaved
inventory. It keeps the focused warmup, sequential, and burst method, with 25 capacity windows per
participant per population. This tests a broader inventory; it does not reproduce the complete
public suite's six-level concurrency history or its collector's retention of per-request statistics.

| Population | Old eXact RPS | Current eXact RPS | React RPS |
| ---------- | ------------: | ----------------: | --------: |
| 1          |      2,139.31 |          2,216.03 |  2,426.03 |
| 2          |      2,234.99 |          2,173.02 |  2,208.40 |
| 3          |      2,306.07 |          2,284.00 |  2,189.68 |
| 4          |      2,122.56 |          2,263.24 |  2,289.74 |
| Combined   |      2,200.56 |          2,234.04 |  2,278.33 |

Current eXact averages 1.52% above old eXact, although it loses in two of four populations. React
averages 1.98% above current eXact. Individual populations range from a 9.48% React lead to a 4.31%
eXact lead. The unchanged old renderer also varies substantially; the wider gap is not evidence
that the accumulated changes slowed eXact by approximately 5%.

## Crossover within unchanged workers

Two additional fresh six-worker populations alternate focused and broader active inventories in
ABBA and BAAB order. All six workers remain alive in both conditions; only which workers receive
timed requests changes. Each worker receives the initial two-second prime plus a five-second prime.
Each block contains 15 interleaved 500 ms c32 windows per active participant. This capacity-only
diagnostic does not run the earlier sequential or burst lanes.

| Population / block | Active inventory | Old eXact RPS | Current eXact RPS | React RPS |
| ------------------ | ---------------- | ------------: | ----------------: | --------: |
| 1 / 1              | Focused          |      2,130.00 |          2,134.65 |  2,167.79 |
| 1 / 2              | Broader          |      2,282.24 |          2,351.11 |  2,314.33 |
| 1 / 3              | Broader          |      2,328.40 |          2,390.00 |  2,339.66 |
| 1 / 4              | Focused          |      2,350.80 |          2,394.61 |  2,367.80 |
| 2 / 1              | Broader          |      2,262.90 |          2,124.63 |  2,120.83 |
| 2 / 2              | Focused          |      2,381.58 |          2,345.48 |  2,339.20 |
| 2 / 3              | Focused          |      2,459.20 |          2,475.56 |  2,454.17 |
| 2 / 4              | Broader          |      2,414.97 |          2,388.25 |  2,373.87 |

The aggregate old/current/React rates are 2,330.20 / 2,337.43 / 2,332.14 RPS in focused blocks and
2,322.12 / 2,313.39 / 2,286.95 RPS in broader blocks. Current versus old is approximately +0.31%
and -0.38%, respectively: this crossover does not establish an old/new throughput gain. Current
versus React is +0.23% and +1.16%. Neither condition reproduces a stable 4.7% React lead.

Throughput rises substantially when returning to the initial inventory in both populations without
restarting the target workers. Active inventory alone therefore does not explain the earlier drop.
Process state, load history, and contemporaneous host conditions remain confounded. This audit
does not turn that observation into an unsupported claim about a particular CPU or V8 mechanism.

## Interpretation

Both independent four-population captures show a modest aggregate old/new improvement, while the
crossover is near zero. This supports retaining the changes without promising a universal gain. The
cross-framework ranking is substantially less stable. Fifty windows within one worker population
do not provide fifty independent observations of process-level variation. Interleaving distributes
host activity across participants but does not guarantee equal effects on different implementations.

The full public capture remains preserved, including its 4.7% React lead. Replacing just that result
with a favorable focused capture would mix methods and discard inconvenient evidence. The public
page instead clarifies the scope of its window percentiles. Future claims about an optimization
should retain a hashed old artifact and compare old/current/control in fresh interleaved populations,
reporting per-population results as well as aggregate request/time accounting.

These observations do not identify an individual scheduler, CPU-frequency, JIT, GC, or collector
mechanism as the cause. They support the retained improvements and reject treating one historical
gap as a reliable regression measurement.

## Validation and cleanup

All three runs completed with response validation and unchanged target artifact identities. Collectors
ran sequentially, without agent-owned builds, tests, or profilers alongside timing. All owned workers
and controlled services closed; the process inventory confirmed no audit workers remained.

Eight report publication, throughput-accounting, and heap-category tests passed. Documentation type
checking and the standalone build passed. Desktop and mobile rendered verification found the new
interpretation note, matched all nine distribution tables and five heap rows to the unchanged chart
JSON, and reported no page errors. No framework runtime or compiler changes were made in this audit.
