# Preserved document tail diagnostic, September 10, 2026

Status: not integrated. No reliable Node throughput improvement was established.

## Hypothesis and implementation

Normal hydratable string output builds the full document, recognizes its doctype,
locates the closing body tag, slices the string, and joins hydration into that
location. The raw-shell experiment bypasses that full-document insertion path.
Preserving the body-close boundary could avoid early string inspection and copying.
Prior sampled assembly results suggested a possible several-microsecond saving,
roughly 5-10% of the small encoded-render workload if much of that work vanished.

The generated-artifact prototype marks the known body's closing write. Its string
sink retains the prefix and tail separately, then returns two chunks. The ordinary
HTML result concatenates those chunks with `+`; the hydration result joins prefix,
fresh hydration script, and tail without inspecting the document prefix or slicing
the completed HTML. Rendering, hydration payload, and complete output bytes remain
unchanged. The sink keeps its output-size accounting and clears retained fields.
Other sinks do not implement the optional prototype boundary method.

This implementation adds sink fields, per-write prefix-length accounting, and an
extra chunk. It is a diagnostic for the fixed compiled document, not a generalized
document-boundary ABI or validated replacement for arbitrary chunks, extensions,
limits, cancellation, or document structures.

Six changing Unicode request checks match complete response bytes in string and
streaming modes. No production source was changed.

## Focused encoded-render screen

Eight independent production processes use 50,000 warmups and 20,000 measured
renders each, forward and reverse variant order. Every string is consumed through
`Response.text()`. Both runtimes use the portable Node artifact in this screen.
Complete document hashes match across all populations.

| Runtime | Baseline pair (microseconds/render) | Candidate pair |
| ------- | ----------------------------------: | -------------: |
| Node    |                        43.66, 44.64 |   48.08, 37.61 |
| Bun     |                        33.72, 34.74 |   32.99, 34.72 |

The Node reversal is large. These screen results do not demonstrate a stable win.

## Native HTTP follow-up

Independent production servers use Node 26.8.1 and Bun 1.4.2 with their normal
adapters. Ten-second warmups precede four rotated 1.5-second blocks per variant.
Two fresh drivers use concurrency 16 each. All benchmark processes run below
normal priority while the PC remains in active use. Full candidate and baseline
responses match byte-for-byte before measurement and every measured response
matches its worker's expected byte/hash identity.

| Runtime / string | Baseline eXact | Preserved tail |  React | Candidate change |
| ---------------- | -------------: | -------------: | -----: | ---------------: |
| Node             |          7,124 |          6,960 | 11,217 |            -2.3% |
| Bun              |         10,284 |         10,446 | 10,594 |            +1.6% |

There are 340,559 valid responses and zero errors. The candidate improves in two
of four Node blocks and three of four Bun blocks. The architecture removes
specific assembly work, but these measurements do not show the predicted gain.
The extra bookkeeping and allocation changes remain part of the candidate cost.
No production change is justified by this capture alone.

Several recent Node captures show a large last-candidate-block reversal, including
this one. A separate identical-build ordering control is therefore warranted
before attributing that recurring pattern to each different implementation.

Scripts, frozen artifacts, Unicode checks, raw screen results and HTTP blocks are
in [the follow-up archive](document-publication-followup-2026-09-10-evidence.zip).
