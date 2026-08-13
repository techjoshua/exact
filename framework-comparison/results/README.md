# Comparison results

Committed reports belong here only after every included participant is complete, passes the shared
correctness gate, records its environment and raw samples, and receives a framework-specialist review.

`npm run measure -w @exactjs/framework-comparison-suite` refuses to run until every included participant is
complete and reviewed. `measure:development` records explicitly non-publishable engineering samples while
controlled participants remain under review. The separate `measure:native` and
`measure:native:development` commands enforce the same policy for the native-full-stack track. All commands
write beneath `.tmp/framework-comparison` by default. Pass
`-- --output=framework-comparison/results/<name>.json` only when deliberately
preparing a reviewable result. Raw measurements contain separate browser, server, build, delivery, memory,
and code-profile dimensions; they do not calculate an overall score.
