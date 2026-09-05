# Comparison results

Compact reviewed reports belong here only after every included participant passes the shared correctness
gate. Raw sample populations are local evidence: preserve them outside source control when investigating a
checkpoint, and publish only the resulting tables, environment summary, artifact identities, and analysis.

`npm run measure -w @exactjs/framework-comparison-suite` and the native measurement command run their
corresponding correctness suites before collecting samples. The `:development` aliases use the same evidence
contract. All commands write beneath `.tmp/framework-comparison` by default. Raw measurements contain
separate browser, server, build, delivery, memory, and code-profile dimensions; they do not calculate an
overall score and must not be written beneath `framework-comparison/results/raw` for commit.

Older local captures may retain `publishable: false` from the removed participant-approval policy. Current
admission uses their correctness, completeness, identity, and environment evidence directly.
