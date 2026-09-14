# ASCII marker encoding follow-up

Date: 2026-09-09. Rejected prototype; retained shared-encoder implementation unchanged.

## Hypothesis

The retained hex-table encoder still creates a UTF-8 byte array for URL keys. An ASCII-only loop
could avoid that allocation by indexing the hex table directly with UTF-16 code units below 128.
The hypothesis was a small additional saving for common asset URLs; no numerical gain was
preregistered. Unicode URLs were included to expose the cost of abandoning a partial ASCII prefix
and falling back to the existing UTF-8 encoder.

## Method

Thirty-two fresh processes: Node/Bun, string/consumed stream, ASCII/Unicode assets, two reversed-order
pairs per cell. Each uses NODE_ENV=production, 5,000 warmups and 12,000 measured renders, three
incidents, two module scripts and two stylesheet links, and complete application-owned documents.
The Unicode fixture adds Japanese characters and a supplementary-plane character to each asset
path; application data remains identical. Both runtimes use the same portable bundle. Streams are
consumed with Response.text(). All paired full-document hashes match.

The control is marker-hex-current, verified against the actual built Node artifact before this
experiment. This is a frozen-bundle prototype only. No production source was changed.

## Results

Positive means longer rendering time. These preliminary local observations are not confidence
bounds, HTTP throughput, or browser timings.

| Runtime | Mode   | Asset fixture  | Pair 1 time change | Pair 2 time change |
| ------- | ------ | -------------- | -----------------: | -----------------: |
| node    | string | small          |             +2.27% |             +9.41% |
| node    | string | unicode-assets |             +4.89% |             -0.84% |
| node    | stream | small          |            +12.15% |             +0.30% |
| node    | stream | unicode-assets |            +14.89% |             -0.32% |
| bun     | string | small          |             -2.87% |             -3.64% |
| bun     | string | unicode-assets |             -3.77% |             +4.79% |
| bun     | stream | small          |             -1.02% |             -1.76% |
| bun     | stream | unicode-assets |             +4.83% |             -0.12% |

Bun improves modestly on ASCII assets, while Node regresses in every ASCII pair. Unicode outcomes
are mixed. The shortcut is not adopted because it adds a second encoding loop without a consistent
benefit across the target runtimes. The existing native UTF-8 encoder plus hex lookup remains.

No new package or browser tests were run for this rejected prototype. Output equality covers these
fixtures, not every encoding input; the retained encoder's broader core and browser validation
remains documented in marker-hex-2026-09-09.md. The overall React parity objective remains unmet.

The archive preserves both artifacts, worker, builder, runner, fixed input, observations, reporter,
and SHA-256 hashes. No task-owned benchmark process remains running.
