# SSR tails, adaptive admission, and connection handling, September 12, 2026

This focused investigation follows the [production checkpoint capture](ssr-production-checkpoint-2026-09-12.md).
It does not replace the full comparison charts. Production renderer and adapter artifacts are unchanged.
Main controls ran sequentially on the same shared Windows PC, using Node 26.8.1 and native Bun 1.4.2.
Load drivers use Node. Instrumentation and control overrides live in isolated diagnostic copies.
Response bodies remain fully consumed and validated; no errors are retried or dropped.

## Node finite-burst tails

Two hundred 16-request bursts per participant and loading mode alternate eXact and React order,
with a 20 ms gap after each pair. Twenty warmup bursts precede each lane. Two fresh populations
reverse HTTP-client variant order. This deliberately tests intermittent bursts, separately from
sustained capacity and from the five-framework public capture. Each normal request still fetches
both controlled-service endpoints. The HTTP control collects the same bytes using node:http;
it is a diagnostic client substitution, not a framework renderer optimization.

| Data client | Loading   | Framework | Burst mean, two populations (ms) | Burst p99, two populations (ms) |
| ----------- | --------- | --------- | -------------------------------: | ------------------------------: |
| fetch       | normal    | exact     |                      8.91 / 9.47 |                   20.72 / 21.26 |
| fetch       | normal    | react     |                      8.47 / 8.67 |                   21.72 / 21.61 |
| fetch       | preloaded | exact     |                      3.55 / 3.61 |                     4.79 / 5.28 |
| fetch       | preloaded | react     |                      3.11 / 3.14 |                     4.51 / 4.52 |
| close       | normal    | exact     |                    17.10 / 17.17 |                   20.61 / 22.33 |
| close       | normal    | react     |                    16.63 / 16.78 |                   21.38 / 22.25 |
| close       | preloaded | exact     |                      3.73 / 3.40 |                     5.13 / 5.22 |
| close       | preloaded | react     |                      3.14 / 3.15 |                     4.31 / 4.53 |
| http        | normal    | exact     |                      6.04 / 6.27 |                     8.26 / 8.93 |
| http        | normal    | react     |                      5.60 / 5.69 |                     7.81 / 8.19 |
| http        | preloaded | exact     |                      3.15 / 3.40 |                     5.06 / 4.72 |
| http        | preloaded | react     |                      3.12 / 3.11 |                     4.57 / 4.97 |

Native fetch reproduces the long tail for both frameworks. Preloading removes most of it,
and the node:http data client substantially reduces it while retaining real service requests.
Closing every fetch connection raises average latency and is rejected as a remedy.

## Bun streaming at concurrency 16

Each fresh worker runs a six-second warmup at total concurrency 16, then twelve-second stages
at total concurrency 16 and 32 with two independent load drivers. Framework/policy order reverses
in the second population. Automatic policy uses the shipping gate. Forced-on/off controls
override admission decisions at both host and inherited render checkpoints, while retaining
the observer. The traced controller uses its own two-millisecond interval sampler; the external
worker histogram is a different observer and cannot establish gate activation.

| Framework | Policy | Concurrency | Valid RPS, two populations | Largest driver p99, two populations (ms) |
| --------- | ------ | ----------: | -------------------------: | ---------------------------------------: |
| exact     | auto   |          16 |              6,194 / 6,246 |                              4.50 / 4.42 |
| exact     | auto   |          32 |              6,372 / 6,564 |                              7.96 / 7.94 |
| exact     | off    |          16 |              6,069 / 6,080 |                              5.73 / 5.55 |
| exact     | off    |          32 |              6,033 / 5,983 |                            10.92 / 12.06 |
| exact     | on     |          16 |              6,214 / 6,287 |                              4.50 / 4.10 |
| exact     | on     |          32 |              6,518 / 6,595 |                              7.90 / 7.96 |
| react     | auto   |          16 |              6,381 / 6,387 |                              4.55 / 4.46 |
| react     | auto   |          32 |              6,277 / 6,324 |                            12.33 / 12.02 |

The automatic gate was enabled at 31 of 48 sampling points in each concurrency-16 stage.
At concurrency 32 it was enabled at 43 / 44 of 48 points. These are sampled states, not the
fraction of individual requests queued. It does activate below concurrency 32 and retains
successful trials. Forced scheduling improves throughput modestly but does not remove the
concurrency-16 gap to React. Lowering the lag threshold is not justified by these measurements;
no production scheduler thresholds or retention rules were changed. All Bun control stages
completed without request errors or invalid responses.

## Connection failures and controls

Each server receives two independent drivers, a ten-second concurrency-32 warmup, and twenty-second
8,000- and 10,000-RPS offered-load stages. Each variant has two fresh populations with reversed
variant order. The minimal Node control returns a fixed 3,964-byte response without framework
rendering. It tests transport capacity, not equivalent application work.

| Server              | Control                                                | Offered RPS | Valid RPS, two populations | Errors, two populations |
| ------------------- | ------------------------------------------------------ | ----------: | -------------------------: | ----------------------: |
| eXact string        | original connection policy                             |       8,000 |              7,961 / 7,966 |                   0 / 0 |
| eXact string        | original connection policy                             |      10,000 |              9,836 / 9,854 |                   0 / 0 |
| React streaming     | original connection policy                             |       8,000 |              3,853 / 3,902 |             1029 / 1402 |
| React streaming     | original connection policy                             |      10,000 |              3,857 / 3,867 |                   0 / 0 |
| fixed-response Node | no rendering                                           |       8,000 |              7,996 / 7,995 |                   0 / 0 |
| fixed-response Node | no rendering                                           |      10,000 |              9,997 / 9,997 |                   0 / 0 |
| React streaming     | backlog 4096                                           |       8,000 |              3,898 / 3,913 |             1400 / 1377 |
| React streaming     | backlog 4096                                           |      10,000 |              3,949 / 3,921 |                   0 / 0 |
| React streaming     | prepared before warmup                                 |       8,000 |              3,922 / 3,874 |               798 / 667 |
| React streaming     | prepared before warmup                                 |      10,000 |              3,905 / 3,834 |                   0 / 0 |
| eXact string        | finite agent timeout                                   |       8,000 |              7,980 / 7,932 |                   0 / 0 |
| eXact string        | finite agent timeout                                   |      10,000 |              9,838 / 9,855 |                   0 / 0 |
| React streaming     | pool prepared immediately before demand                |       8,000 |              3,921 / 3,887 |                   0 / 0 |
| React streaming     | pool prepared immediately before demand                |      10,000 |              3,900 / 3,902 |                   0 / 0 |
| React streaming     | pool prepared in steps of 16 immediately before demand |       8,000 |              3,881 / 3,869 |                   0 / 0 |
| React streaming     | pool prepared in steps of 16 immediately before demand |      10,000 |              3,861 / 3,913 |                   0 / 0 |

Connection preparation errors are retained separately from the timed stages:

| Preparation                               | Errors, two populations |
| ----------------------------------------- | ----------------------: |
| Before ten-second warmup                  |                  24 / 0 |
| Immediately before demand, doubling steps |                  0 / 24 |
| Immediately before demand, steps of 16    |                   0 / 0 |

The reproduced React refusals cluster in the first second of the 8,000-RPS stage, while
fresh connections expand toward 512 total in flight. The workers remain alive, with no handler
or recorded server socket errors. Increasing the listen backlog to 4096 does not eliminate
refusals. Preparing a pool before the ten-second low-concurrency warmup is ineffective because
idle sockets expire during that warmup. Preparation immediately before offered load removes
measured-stage failures, but doubling the preparation concurrency still produces 24 setup
failures in one population. Those failures are retained rather than relabeled as successful load.
Growing the pool in steps of 16 per driver produces zero setup and measured errors in both
populations. Throughput remains about 3,900 RPS: preparing connections does not remove the
render/response capacity limit or the missed arrivals above that limit.

These results identify a connection-growth/overload interaction in the tested Node hosting path.
They do not identify an incorrect React render or establish that every historical refusal had
the same cause. The fixed-response Node control has no errors at either offered rate. Its much
cheaper handler does not reproduce the saturated rendering workload.

### Idle socket retirement correction

The original Node load agents have no finite timeout. In Node 26.8.1 and the installed Node 24.11.1,
the agent starts from an idle timeout of zero and only lowers a finite value to the server hint.
An isolated server advertising two seconds leaves the original agent socket at timeout zero;
with a ten-second agent bound, Node assigns a one-second idle timeout and retires that socket
before the next request at 1.3 seconds. The one-second margin comes from the agent keep-alive buffer.
The [Node HTTP documentation](https://nodejs.org/api/http.html#requestreusedsocket) describes
reused-socket reset races. The built-in agent source and isolated probe are retained in the archive.

The retained harness correction sets the sustained agent timeout to its request deadline and
uses ten seconds for the burst agent. Existing request deadlines and first-attempt error accounting
remain intact. The new sparse-demand regression failed before this change. A second regression
checks that the burst client retires a socket using the advertised server hint.

Fresh eXact default and finite-timeout controls both have zero errors. Server-side idle expirations
drop to zero in the finite-timeout controls because clients retire idle sockets first. This proves
bounded lifetime management, not that the historical eXact or React ECONNRESET failures are solved.
The original eXact connection failures did not reproduce in these repeats.

## Attribution limits and follow-up diagnostics

The timer trace is intrusive: obtaining call stacks changes timing. It observes the native
Undici idle-validation path but does not reproduce the approximately 20 ms uninstrumented burst
p99 in that run. It must not be used to assign the entire burst tail to one timer. The earlier
[upstream scheduling change](https://github.com/nodejs/undici/pull/5606) and the existing sequential
probe establish a timer-related risk; the paired HTTP-client controls establish the broader
data-fetch path as the main target for the burst investigation. No global fetch or timer patch
was installed in production. A separate Node 24.11.1 run is diagnostic evidence, not a recommendation
to pin that historical runtime release. The final untraced Node 26 repeat restores the roughly
21 ms eXact tail, so the lower traced value is not accepted as a performance improvement.

| Additional burst probe   | Framework | Normal burst p99 (ms) |
| ------------------------ | --------- | --------------------: |
| Node 26, timer tracing   | exact     |                 12.49 |
| Node 26, timer tracing   | react     |                 11.62 |
| Node 24.11.1             | exact     |                 12.00 |
| Node 24.11.1             | react     |                 11.31 |
| Node 26, untraced repeat | exact     |                 21.24 |
| Node 26, untraced repeat | react     |                 22.18 |

## Measurement policy

For steady-state offered-load capacity, prepare the intended connection population immediately
before demand with gradual concurrency growth, and report every setup failure separately.
Keep abrupt connection-growth stages as a distinct transport-overload diagnostic. Changing
connection preparation changes the workload; it must not silently replace earlier populations.
The previous full baseline, its errors, and its browser measurements remain unchanged.

## Validation and retained evidence

The comparison suite passed all 90 tests, including two new idle-socket regressions. The client
tests also passed on Node 24 (16 tests). Build-script tests (112), docs tests (10), changed-file
lint, and the docs typecheck and build passed. Desktop and mobile browser checks each verified
17 distribution tables and five heap rows, with no page errors or horizontal overflow.

Post-capture checks verified every measured burst response against one stable body identity per
framework, all load-stage accounting, zero invalid load responses, and successful worker telemetry.
Hashes confirm that 19 renderer, adapter, and participant source files match the original capture.
The additional timer, Node 24, and untraced repeat probes use the corrected burst client; the
untraced repeat still reproduces the long tail after that pooling correction.

The [structured results](ssr-followup-2026-09-12.json) retain stage results, preparation errors,
validation outcomes, and source hashes. The [evidence archive](ssr-followup-2026-09-12-evidence.zip)
contains complete raw captures, diagnostic scripts, client sources, logs, and browser screenshots.
