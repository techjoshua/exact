# Node streaming throughput and WSL localhost routing, September 20, 2026

> Retained as a result summary. Raw capture paths mentioned below are historical identifiers;
> bulk samples and private experiment bundles are not distributed. See [benchmark retention](benchmark-retention.md).

The relative throughput drop is reproducible without changing the renderer. On this WSL host, mirrored networking routes IPv4 `127.0.0.1` through a virtual Ethernet interface. The unchanged eXact artifact recovers its previous relative throughput when traffic uses native Linux loopback. React moves in the opposite direction, explaining why a single host change did not lower both frameworks equally.

## Controlled result

Each capture uses Node preloaded streaming, two independent Node load-driver processes, a ten-second c16 warmup, then fifteen seconds each at c16 and c32. Each capture starts fresh workers in eXact/React then React/eXact order. Reported c32 rates include drain and aggregate valid responses over the union of simultaneous driver spans. The network-namespace controls use the same user-namespace UID mapping, renderer and adapter artifacts, payload identities, and recorded TCP settings. The IPv6 control changes the outer worker/client address to `::1` within the original network namespace.

| Network control, execution order        | eXact RPS | React RPS | eXact/React |
| --------------------------------------- | --------: | --------: | ----------: |
| Mirrored IPv4, first control            |    10,290 |     5,226 |      1.969× |
| Native IPv4, private network namespace  |    12,776 |     4,524 |      2.824× |
| Native IPv6, original network namespace |    12,287 |     4,363 |      2.816× |
| Native IPv4, repeated                   |    13,261 |     4,412 |      3.006× |
| Mirrored IPv4, return control           |    10,074 |     5,211 |      1.933× |

The native-loopback controls range from 2.824× to 3.006×, bracketing the original 2.952× reference. Returning to mirrored IPv4 returns the ratio to 1.933×. This identifies a reproducible network-path effect on relative throughput. It does not establish which individual kernel, packetization, or scheduling mechanism accounts for each microsecond, nor does it prove that all historical renderer-only timing differences share one cause.

## Observed route

IPv4 resolves to `127.0.0.1 via 169.254.73.249 dev loopback0 table 127`; `loopback0` is a vmbus Ethernet interface with MTU 1500 and a multiqueue qdisc. IPv6 `::1` resolves locally through `lo`, whose MTU is 65536. The WSL configuration records mirrored networking, modified at 00:49 UTC on September 20, followed by a VM boot at 00:52 UTC. That timing supports the historical attribution; the repeated route controls supply the causal evidence. MTU alone was not isolated.

Microsoft documents that [mirrored localhost forwarding intercepts bindings and forwards traffic to Windows](https://github.com/microsoft/WSL/blob/master/doc/docs/technical-documentation/localhost.md). The [WSL networking documentation](https://learn.microsoft.com/en-us/windows/wsl/networking) describes IPv4 localhost interoperability. These platform descriptions are consistent with the observed route; the measured rates above come from this repository’s experiments.

## Rendering and response experiments

| Candidate                                           | Result                                                                                                                                                                         |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Earlier renderer artifact                           | About 10,251 / 5,162 RPS on mirrored IPv4, ratio 1.986×. Restoring the earlier renderer did not recover the missing ratio.                                                     |
| Reuse byte counts in the document stream sink       | Initial renderer-only improvement did not survive HTTP comparison: 1.904× on mirrored IPv4. Native repeat reached 2.953×, within the unchanged controls. Rejected.             |
| Cork Node response writes until the next immediate  | 1.860× on mirrored IPv4, slower than surrounding controls. Rejected.                                                                                                           |
| Install the demand abort listener only when blocked | 2.022× on mirrored IPv4 and 2.851× on native loopback. No consistent improvement. Rejected.                                                                                    |
| Existing direct progressive response API            | 2.114× on mirrored IPv4. It bypasses a Web Stream adapter round trip, but measures a different API and does not explain the route effect. The benchmark API remains unchanged. |
| Conditional synchronous direct-response hooks       | 1.979× on mirrored IPv4. Rejected.                                                                                                                                             |

An admission-policy diagnostic still showed scheduled admission in 56 of 60 c32 samples. The earlier explanation that scheduling had stopped activating is unsupported. CPU profiles show similar old/current distributions, including writev at about 9.4–9.6%, diagnostic CPU collection at 4.6–4.8%, and serialization and GC around 3% each. They do not identify a dominant new renderer hotspot. Profiled throughput is kept separate from unprofiled results.

No renderer, compiler, or adapter candidate from this investigation is retained. Task callback discovery, hydration correctness, the Bun response contract, and the earlier hydration-slot optimization remain in place.

## Remaining historical differences

The full native-loopback run reaches a Node preloaded streaming ratio of 2.878×, 44.2% above the last mirrored capture but 2.5% below the original 2.952× reference. Normal streaming reaches 1.552×, 19.9% above the mirrored capture and 1.0% below the original reference. Six other c32 comparisons exceed the original ratios. These small remaining differences are retained, not rounded into a claim of complete recovery.

The preserved earlier bundle exactly matches the original eXact SHA-256. Additional native-loopback controls ran the earlier/current preloaded pair, then current/earlier/earlier/current normal-loading captures. Each capture retained both framework-order populations. Normal loading used a ten-second c16 warmup and twenty seconds at c32.

| Artifact control      | eXact RPS | React RPS |  Ratio |
| --------------------- | --------: | --------: | -----: |
| preloaded-before      |    12,164 |     4,401 | 2.764× |
| preloaded-current     |    12,342 |     4,367 | 2.826× |
| normal-current        |     3,437 |     2,263 | 1.519× |
| normal-before         |     3,478 |     2,206 | 1.576× |
| normal-before-repeat  |     3,518 |     2,208 | 1.593× |
| normal-current-repeat |     3,541 |     2,274 | 1.557× |

The current preloaded ratio improves 2.2% over the earlier bundle in this matched pair. The normal-loading ratios favor the earlier bundle by 3.7% in the first pair and 2.3% in the reverse pair, with React throughput also changing. Current eXact absolute throughput is 1.2% lower in the first normal pair and 0.7% higher in the reverse pair. This does not justify claiming that every historical fraction is recovered or that the normal-loading ratio difference has been fully attributed.

The only bundle changes record hydration-slot provenance. An untimed call probe confirms streaming completes one result containing a 14-byte tail, without calling the string hydration-insertion helper or reading that provenance. A focused candidate skips the completion-time slot lookup for already-streamed results. It fails to improve the fresh normal-loading control: 3,428 / 2,264 RPS (1.514×) for current versus 3,347 / 2,297 (1.457×) for the candidate. Both retain identical responses and zero errors. The candidate is rejected.

Unchanged current-artifact native preloaded controls span 2.824–3.006×, and repeated normal-loading controls vary as shown above. This establishes substantial process-population variability, but does not prove a statistical confidence interval or a precise cause for every remaining percent. The major route-induced loss is explained and avoided; the small residual normal-loading ratio difference remains unisolated, with no demonstrated corrective source change from these experiments.

## Measurement correction and verification

Linux measurement entry points now reject routed or unverifiable IPv4 loopback by default and record the actual route and namespace. The complete [replacement benchmark](native-loopback-2026-09-20.md) runs in one private Linux network namespace, preserving the original IPv4 workload. It does not change host networking or LAN access to the documentation server. An explicit diagnostic override records the routed status instead of describing it as native loopback.

All focused HTTP captures validate identical response bodies for each participant: eXact 3,963 bytes and React 3,457 bytes. There are zero invalid responses and zero request errors. The structured evidence retains SHA-256 identities, artifact hashes, TCP settings, counters, and every completed candidate. Six route-probe tests cover acceptance, rejection, malformed or failed probes, explicit overrides, and non-Linux behavior; all 100 comparison tests and 127 build-script tests passed. The new helper also passed its six tests outside the workspace without package outputs.

The [structured results](ssr-loopback-investigation-2026-09-20.json) summarizes the experiments. The [preceding investigation](rps-cause-investigation-2026-09-20.md) records the earlier unresolved diagnosis; this controlled result supersedes that uncertainty.
