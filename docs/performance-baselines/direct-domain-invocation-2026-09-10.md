# Direct component domain invocation experiment, September 10, 2026

Status: rejected isolated artifact experiment. No production code changed.

Hypothesis: removing one immediately invoked closure around a direct server render might save 0-2% on small strings and 1-4% on large strings. The actual artifact has three matching call sites. The replacement keeps the active component domain, receiver, access ordering, and finally restoration, and retains the shared renderer.

Twenty-four fresh production processes compare the retained scalar-prop build, candidate, and React across Node/Bun and small/large strings in two reversed orders. Each uses 5,000 warmups and 10,000 measured renders. Complete eXact document hashes match. Values are mean microseconds per render, lower is better.

| Runtime | Document | Retained | Candidate | React |
| --- | --- | ---: | ---: | ---: |
| node | assets | 32.85 | 33.09 | 22.19 |
| node | large | 165.81 | 163.81 | 132.29 |
| bun | assets | 36.95 | 36.62 | 31.69 |
| bun | large | 205.99 | 212.12 | 183.77 |

Bun large strings regressed in both orders. The mixed result does not justify integrating this variant or running a broader matrix. No browser claim is made for the experimental artifact. The retained implementation remains unchanged. Raw results, scripts, and artifact provenance are in direct-domain-invocation-2026-09-10-evidence.zip.

Evidence archive SHA-256: `02fc1775d8eca29c6174314ea766d1b69fe47e26916051ab1fb942ebd24203fe`. All task-owned benchmark and validation processes have exited.
