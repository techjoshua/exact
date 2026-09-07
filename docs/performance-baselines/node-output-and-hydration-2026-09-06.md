# Node output assembly and deferred hydration experiments, 2026-09-06

Raw captures referenced in this note are local experiment artifacts and are excluded from Git.
Published chart data is retained under `apps/docs/src/data`.

**Scope correction:** the hydration transport below buffers HTML before forwarding it. It does not
test immediate response writes throughout rendering. The subsequent
[immediate-write experiment](immediate-response-writes-2026-09-06.md) tests that proposal with
callbacks registered during the HTML pass and executed at the hydration footer.

This focused study separates HTML assembly from deferred hydration serialization. The proposed
hydration design emits HTML first, captures component values during rendering, and serializes those
captured values at the document footer through Node output. It does **not** defer component HTML
generation or merely replay previously generated HTML strings.

The raw evidence (local capture: `node-output-and-hydration-2026-09-06.json`) preserves the interleaved measurements,
artifact identities, diagnostic runners, and output checks. These captures do not replace the public
five-framework charts.

## Existing behavior and experiment boundary

The compiler-closed renderer already publishes captured resumption records during HTML generation
and serializes the hydration envelope after HTML. The Node adapter collects produced output until
production and request-scope release succeed, then commits it in one terminal write. This permits a
clean error response when hydration validation or cleanup fails.

The hydration prototype retains graph validation, positional publication, JSON serialization, and
script-safe escaping. It splits only compiler-owned envelope and resumption containers. Application
graphs remain whole `JSON.stringify` calls. Registered reactive collections use the existing complete
payload serializer so its shared encoding state is preserved. One variant allocates deferred
serializer closures; another walks captured records directly through a shared serializer.

Both prototypes use native `Buffer.byteLength` for hydration accounting. Node handles UTF-8 output;
it does not serialize JavaScript records into JSON or escape script-breaking characters. Byte limits
still require accounting somewhere. Removing them would change the framework contract.

The native transport diagnostic coalesces HTML into one write, then writes hydration records as they
are serialized. It avoids a complete document string. Its footer boundary is fixture-specific, and
its synchronous production does not provide bounded asynchronous backpressure. Hydration size errors
can occur after commitment. It is an experiment, not a production streaming implementation. Serializer
closures are prepared from the already-captured, validated records at the footer; the compiler was
not changed to register callbacks during each component's render.

ASCII and hostile-text responses match the baseline byte for byte through a real Node server.
Cases include closing-script text, U+2028/U+2029, a surrogate pair, and a lone surrogate. These checks
establish fixture equivalence, not complete streaming lifecycle coverage.

## Renderer and final encoding

Four fresh process populations each discard 25,000 warm renders and measure 20 balanced batches of
4,000 renders per variant. Every render includes final `Buffer.from` encoding and checks the returned
byte count; completed batches must match the full-output hash.

| Variant                                    | Mean microseconds per render |
| ------------------------------------------ | ---------------------------: |
| Existing whole-payload serializer          |                       21.036 |
| Whole payload, native hydration byte count |                       20.624 |
| Deferred hydration callbacks               |                       22.140 |
| Deferred records without closures          |                       21.604 |

Splitting hydration increased renderer-plus-encoding time in all four populations: approximately
5.2% with callbacks and 2.7% with records. Native counting alone averaged 2.0% faster, with one slower
population. These are fixture-specific timing results; allocation differences were not measured.

## Hydration HTTP screen

Two fresh populations each run 12 balanced 500 ms c32 windows per variant in each lane, with
discarded two-second primes. All responses match their baseline identity; validation follows timing.
The ordinary lane includes the controlled API service. Preloading removes that service work to
expose rendering and transport costs. Neither lane replaces a large-document or slow-client study.

| Variant                                             | Ordinary c32 RPS | Preloaded c32 RPS |
| --------------------------------------------------- | ---------------: | ----------------: |
| Existing eXact                                      |          2,147.8 |           6,920.9 |
| Whole payload, native hydration byte count          |          2,052.3 |           6,901.1 |
| Deferred callbacks, existing buffered transport     |          2,163.4 |           6,884.4 |
| Whole hydration payload, native streaming transport |          2,003.6 |           5,056.2 |
| Deferred callbacks, native streaming transport      |          1,632.6 |           3,443.2 |
| Deferred records, native streaming transport        |          1,715.2 |           3,428.8 |

Callback streaming lost 24.0% ordinary throughput and 50.2% preloaded throughput. Removing closures
still lost 20.1% and 50.5%, respectively. Both streaming record variants lost in both populations
and both lanes. Whole-payload streaming was less costly but still lost 6.7% and 26.9% in aggregate.
Deferred serialization with the existing collector was approximately flat in aggregate and changed
direction between populations. Native byte counting alone did not establish an HTTP gain.

Do not promote these prototypes or add a compiler ABI method. The existing captured record list
already supplies deferred hydration work; an additional callback list is not necessary for that
ordering. The small-write transport path failed this fixture screen. Larger documents might make
memory or time-to-first-byte tradeoffs worthwhile, but those benefits were not measured here and
would require explicit backpressure and post-commit failure semantics.

## Independent HTML assembly candidates

Earlier experiments queued already-generated HTML spans. Those did not test deferred hydration.
Many small native writes were substantially slower; adding content length or coalescing writes
recovered much of that loss but did not establish a consistent improvement.

A separate renderer screen favored collecting strings in an array and joining after production.
An ASCII attribute-accounting shortcut also improved isolated renderer measurements. A larger
four-population HTTP confirmation tested the original implementation, array joining alone, both
changes combined, and React. Each population used 30 balanced rounds of ten sequential requests,
16-request bursts, and 500 ms c32 windows in both ordinary service and preloaded-data lanes.

| Variant                            | Ordinary c32 RPS | Preloaded c32 RPS | Sequential mean ms | Burst mean ms |
| ---------------------------------- | ---------------: | ----------------: | -----------------: | ------------: |
| Existing eXact                     |          2,312.3 |           7,304.9 |              0.772 |         8.000 |
| Array joining                      |          2,266.8 |           7,052.6 |              0.772 |         8.028 |
| Array joining and ASCII attributes |          2,365.6 |           7,291.9 |              0.775 |         7.949 |
| React                              |          2,352.3 |           7,507.0 |              0.775 |         7.816 |

Array joining lost 2.0% ordinary throughput and 3.5% preloaded throughput. The combined candidate
gained 2.3% ordinary throughput, with approximately flat aggregate preloaded throughput, but varied
substantially between populations: its preloaded result ranged from 7.9% faster to 10.1% slower than
the baseline. Earlier attribute-only HTTP screens also raised regression concerns. Discard both
candidates rather than claiming a reliable improvement or a consistent lead over React. Retain the
Node adapter regression check that split surrogate spans are assembled correctly before commitment.

## Final verification

The restored SSR and Node-adapter packages type-check. All 221 SSR tests and 14 Node-adapter tests
pass. The rebuilt comparison SSR entry matches the frozen baseline SHA-256 exactly. No experimental
hydration serializer or transport was installed in production source, and no compiler ABI changed.
