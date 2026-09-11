# Static document script coalescing, September 10, 2026

Retained compiler optimization: an empty external script directly inside a document host can join
that host's static server writes when all its attributes are statically safe. The compiler keeps
the script's generated element ID, allowing the paired client intrinsic to adopt it. Dynamic
attributes, unsafe URL forms, inline content, spreads, keys, events, refs, explicit islands, and
enhancements retain their previous handling. No new runtime helper or artifact field was added.

The hypothesis was that eliminating two independent script programs in the literal four-asset
document would reduce construction and writer dispatch. This is a small part of the broader shell
work, not an implementation of application-only hydration ownership.

## Focused encoded-string screen

| Runtime | Order | Previous microseconds/render | Candidate microseconds/render |
| --- | --- | ---: | ---: |
| Node | Previous first | 33.22 | 32.43 |
| Node | Candidate first | 33.51 | 32.91 |
| Bun | Previous first | 27.37 | 27.84 |
| Bun | Candidate first | 27.68 | 26.53 |

Eight fresh production processes each warmed 50,000 renders and measured 20,000 encoded renders
through `Response(...).text()`. Both runtimes used the portable Node artifact to isolate renderer
work, with below-normal process priority. The PC remained available for user work. Node improved
in both orders by about 1.8–2.4%; Bun was mixed. This is not an HTTP capacity result or a new React
comparison. It does not establish an end-to-end gain for the normal dynamic-asset application.

All eight outputs were byte-identical, 4,270 bytes, SHA-256
`a2dfc93c522d1da28d6fc0aaef1a61ed1b9f937f95bf65c17e74b8d425188725`.
The control already included the retained literal-URL/stylesheet optimization, so these numbers
isolate the additional static-script change rather than comparing against the older compiler.

## Correctness and restoration

Native compiler tests and build passed. The full SSR suite passed 365 tests in 57 files, including
head/body script ordering, static attribute escaping, generated identity, and unsafe dynamic URL
rejection in string and stream output. Test type checking, ESLint, source architecture, JSDoc, and
initial/frozen ABI checks passed.

The candidate passed 56 browser checks across Node/Bun string/stream. The final browser test
explicitly retained external script and application DOM references and checked their identity after
hydration and interaction. The fixture uses a literal script URL; its real generated client entry
is copied to that URL to avoid a self-referential content-hash filename during this diagnostic.
The entire application still executes its generated client code.

Temporary application source was restored, then normal bundles were rebuilt. Their hashes remain:

- Node: `2ebf7fed2ee0dc972095976bf55230ccc924a120251a463af26838e8ebb2cd18`
- Bun: `9adc04f4d5d6e78ad95730319a475918c3b4b045da9a93f812c81aa827d60d2e`

The ordinary benchmark's script sources are dynamic, so the compiler change does not alter those
bundles. The combined-shell prototype remains unintegrated and Node string remains an unresolved
React gap. See the [ownership audit](document-hydration-ownership-audit-2026-09-10.md) for the next
architectural work.

[Evidence archive](document-script-2026-09-10-evidence.zip): compiler source, scripts, frozen control
and candidate artifacts, raw screen, native/SSR/typecheck logs, browser output, reports, and a
verified SHA-256 manifest.
