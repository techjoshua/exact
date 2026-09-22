# Comparison results

Accepted comparison summaries update the single maintained
[results file](../../docs/performance-baselines/results.json), with source identity, environment,
methodology, sample counts, and limitations. Do not create per-run reports in this directory.
Follow the [retention policy](../../docs/performance-baselines/benchmark-retention.md).

`npm run measure -w @exactjs/framework-comparison-suite` and the native measurement command run their
corresponding correctness suites before collecting samples. The `:development` aliases use the same evidence
contract. Keep captures in ignored local output directories; select an explicit output path when a
collector's default is under `results/`. Raw measurements contain
separate browser, server, build, delivery, memory, and code-profile dimensions; they do not calculate an
overall score and must not be written beneath `framework-comparison/results/raw` for commit.

Older local captures may retain `publishable: false` from the removed participant-approval policy. Current
admission uses their correctness, completeness, identity, and environment evidence directly.
