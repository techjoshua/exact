# Comparison results

Committed reports belong here only after every included participant passes the shared correctness gate and
the result records its environment, immutable artifact identities, interleaved sample order, and raw samples.

`npm run measure -w @exactjs/framework-comparison-suite` and the native measurement command run their
corresponding correctness suites before collecting samples. The `:development` aliases use the same evidence
contract. All commands write beneath `.tmp/framework-comparison` by default. Pass
`-- --output=framework-comparison/results/<name>.json` only when deliberately
preparing a committed result. Raw measurements contain separate browser, server, build, delivery, memory,
and code-profile dimensions; they do not calculate an overall score.

Older immutable captures may retain `publishable: false` from the removed participant-approval policy. Do
not rewrite those files: current admission uses their correctness, completeness, identity, and environment
evidence directly.
