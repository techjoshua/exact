# Retained eXact versus React with populated asset lists

Date: 2026-09-09. The overall performance goal remains unmet.

## Purpose and controls

The retained direct-map optimization improved eXact relative to its previous build when shell
asset lists were populated. This run compares that rebuilt implementation directly with React
on the same fixture. The eXact Node artifact matches frozen direct-map-current.mjs byte for byte,
SHA-256 8c8c3cd2e5f383755dc95e0dae347e39e2bd1551e85ad483131c1e34dc3d8b42.

Thirty-two fresh processes: Node/Bun, string/consumed stream, three/96 incidents, two reversed-order
pairs per cell. NODE_ENV=production, 5,000 warmups and 12,000 measured renders per population.
Both participants receive identical document options containing two module scripts and two
stylesheet links. The existing Document implementations parse these options and render their
own complete shells. The worker verifies full document framing and all four asset URLs. Repeated
populations preserve each framework's full-body hash. Framework output hashes are not expected
to match each other because hydration and framework markup differ.

This uses each framework's Node-target participant artifact on both runtimes and consumes streams
with Response.text(). It measures renderer completion, not runtime-specific HTTP adapter capacity,
asset fetches, browser startup, or early-shell latency. It is deliberately separate from the prior
empty-tag HTTP comparison. No fixture-specific production code was introduced.

## Results

Median microseconds per render, lower is better. Positive time difference means eXact took longer.
These are medians of two local populations, not confidence intervals. There was visible variability,
particularly Node small strings and Bun large strings; raw populations remain included.

| Runtime | Output | Fixture | eXact microseconds | React microseconds | eXact time difference |
| ------- | ------ | ------- | -----------------: | -----------------: | --------------------: |
| node    | string | small   |              54.57 |              28.28 |                +93.0% |
| node    | string | large   |             239.08 |             163.78 |                +46.0% |
| node    | stream | small   |              87.94 |              91.24 |                 -3.6% |
| node    | stream | large   |             254.34 |             371.31 |                -31.5% |
| bun     | string | small   |              49.41 |              36.67 |                +34.8% |
| bun     | string | large   |             276.84 |             203.67 |                +35.9% |
| bun     | stream | small   |              63.14 |              57.90 |                 +9.0% |
| bun     | stream | large   |             307.22 |             270.03 |                +13.8% |

React leads string rendering on both runtimes and both sizes. eXact leads Node stream completion;
the small-document margin is much narrower than the historical empty-tag HTTP comparison. React
leads Bun stream completion in this run. The latest retained optimization has not closed these gaps.

Populated asset lists reveal an important additional workload for ongoing experiments. The next
investigation should isolate the cost of each shell list and its generated operations, comparing
zero/one/several entries in the same run. Cross-capture absolute differences cannot establish the
incremental asset cost because workstation load and measurement scopes differ.

No production changes were made for this comparison. The retained map build previously passed
283 SSR tests and 56 browser correctness checks, documented in direct-map-2026-09-09.md. This run
adds full document and asset-presence checks, not new browser timing. Historical public benchmark
charts are unchanged. All worker processes exited.

The evidence archive preserves both participant artifacts, fixed input, runner, worker, raw results,
reporter, dependency versions, and a SHA-256 manifest. Reproduction requires locked dependencies.
