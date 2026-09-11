# Complete scalar proof reference layout, September 10, 2026

Status: both isolated variants rejected; production unchanged.

Hypothesis: initialize the scalar proof in the eligible reference literal so the final six-field object can stay in-object, avoiding the separate PropertyArray observed in the retained helper. Named fields precede the computed brand and proof. Non-scalar values retain the ordinary private-reference layout. First-attempt gating, reused-input fallback, domain, prototype, own key order and consumption remain unchanged. The prototype repeats scalar checking in the existing proof marker; a follow-up tests preserving the already established identity-matched proof. Expected benefit was 1-3% on large trees.

Node focused checks compare final prototype, own-key order, scalar/null/object/function values, proof consumption, and key normalization after invocation reuse. They pass. A Node V8 DebugPrint of real issued references inside their component domain confirms the retained object has four in-object properties plus a three-slot PropertyArray, while the complete-proof candidate has six in-object properties and an empty properties backing array. This establishes that local layout difference, not a whole-render allocation or throughput gain.

Seventy-two fresh production processes compare retained/candidate/React on Node/Bun string/encoded/stream, small/large documents, two reversed orders, 5,000 warmups and 10,000 measured renders. Full eXact document hashes match. Values are mean microseconds per render.

| Runtime | Mode | Document | Retained | Candidate | React |
| --- | --- | --- | ---: | ---: | ---: |
| node | string | assets | 32.93 | 32.66 | 22.26 |
| node | string | large | 159.18 | 169.52 | 129.23 |
| node | encoded | assets | 49.11 | 49.61 | 32.42 |
| node | encoded | large | 193.33 | 198.57 | 178.48 |
| node | stream | assets | 54.56 | 55.43 | 66.14 |
| node | stream | large | 186.26 | 187.99 | 333.75 |
| bun | string | assets | 36.90 | 37.03 | 31.49 |
| bun | string | large | 208.73 | 208.19 | 184.11 |
| bun | encoded | assets | 38.51 | 38.97 | 37.04 |
| bun | encoded | large | 211.54 | 214.49 | 203.40 |
| bun | stream | assets | 55.19 | 54.00 | 53.00 |
| bun | stream | large | 289.77 | 286.66 | 262.22 |

The layout saving does not establish a renderer win. Most results are neutral or slower; one Node large-string candidate population is substantially slower and remains in the record. No public ABI, browser, or production-source change is claimed for the prototype.

## Avoiding the repeated scalar check

The follow-up preserves a constructor-established proof after checking first-attempt ownership, private inputs, and prop identity. Other cases retain the original validation. Forty-eight fresh production processes cover Node/Bun, string/stream, small/large, and two reversed orders against the retained build and React, with 5,000 warmups and 10,000 measured renders. All eXact full-document hashes match.

| Runtime | Mode | Document | Retained | Candidate | React |
| --- | --- | --- | ---: | ---: | ---: |
| node | string | assets | 33.14 | 32.95 | 22.28 |
| node | string | large | 154.46 | 162.13 | 133.00 |
| node | stream | assets | 54.29 | 53.55 | 65.87 |
| node | stream | large | 186.26 | 188.17 | 330.82 |
| bun | string | assets | 36.50 | 37.37 | 32.31 |
| bun | string | large | 210.33 | 208.39 | 180.98 |
| bun | stream | assets | 53.70 | 53.30 | 52.19 |
| bun | stream | large | 287.22 | 288.00 | 264.59 |

Node large strings regress in both orders. The narrower allocation layout and removal of repeated scalar checking do not produce a useful cross-runtime improvement. Both variants are rejected. No further browser or package validation is warranted for these rejected artifacts. The retained reference metadata shortcut and its validated canonical builds are unchanged. The next investigation should target component handoff/dispatch rather than another rearrangement of reference fields.

All scripts, raw results, provenance, frozen artifacts, Node layout output, and focused checks are archived in complete-proof-2026-09-10-evidence.zip. The overall performance goal remains unmet.

Archive SHA-256: `0b1bd5cae1af3318261bdd0da27ec72aefe84a34dda81b0bb4718246a8f7a3e3`.
