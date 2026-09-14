# Native JSON encoding versus script escaping under HTTP

Status: diagnostic trace completed. Production implementation remains unchanged.

## Question and method

The preceding renderer-region trace found serialization plus escaping rising from
approximately 2.27 microseconds in a tight loop to 6.82 under HTTP. This follow-up
splits the same implementation into native JSON.stringify and its three existing
script-escaping replacements. No escaping or validation is removed.

The instrumenter retains the preceding eight regions and adds two nested regions.
One invocation in 64 is sampled. Timing ends when the synchronous render invocation
returns, excluding awaited continuations. Wrappers and timestamps alter execution;
exclusive values include uninstrumented descendants and some bookkeeping. They are
not unbiased production self-times or guaranteed recoverable optimization budgets.

Two fresh production Node 26.8.1 workers each receive ten seconds of HTTP warmup.
Each then runs 10,000 loop warmups and 10,000 measured loop renders, five seconds of
HTTP at two drivers with concurrency 16 each, and another warm/measured loop pair.
All processes use below-normal priority. The same preloaded application data and
document options are retained within each worker. User PC workload may vary.

## Results

Mean exclusive microseconds per sampled document across both workers:

| Region | Loop before | HTTP | Loop after |
| --- | ---: | ---: | ---: |
| JSON.stringify | 1.36 | 5.06 | 1.33 |
| Script escaping | 0.83 | 1.98 | 0.86 |
| Remaining serializeJson wrapper work | 0.75 | 1.26 | 0.58 |

Splitting the region introduces additional wrappers and timestamps. Its totals
therefore should not be compared directly with the preceding unsplit trace as a
performance change. Within this capture, native encoding accounts for the larger
loop-to-HTTP increase. Escaping also slows; combining escape passes alone cannot
address the observed native-encoding increase.

The other region averages retain the preceding pattern. Program writer execution
rises from 10.50 to 17.31 microseconds, issued component content from 4.16 to 9.40,
and positional validation from 6.22 to 7.90. The slowdown remains distributed.
This trace does not establish why JSON.stringify takes longer, whether its payload
representation differs, or whether cache/locality, GC or runtime scheduling causes
the increase. Prior payload audits on an earlier artifact must not substitute for
checking the actual current HTTP payload if representation becomes the hypothesis.

Diagnostic HTTP rates are 8,109.84 and 7,929.97 RPS, with 80,292 valid measured
responses and zero errors. They are instrumented observations, not new baseline
rates or a React comparison. Sixteen complete-document Node string/stream cases
match the uninstrumented retained build. No package/browser acceptance is claimed.

## Decision and evidence

Do not change escaping or introduce a custom serializer based on this timing
alone. The useful finding is the location of most of this region's increased cost,
not proof that required serialization work can be removed. The overall framework
performance objective remains unresolved.

All owned processes exited; only the user's Codex Node remained. The adjacent
archive contains 14 SHA-256-verified files, including builder preparation, builder,
instrumented artifact/worker, runner, raw capture, summary, parity checks and
original artifacts. Measurement hashes and archive contents were verified.
