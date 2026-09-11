# Literal URL compilation, September 10, 2026

Retained compiler change: server render programs can incorporate provably safe literal URL
attributes into static markup. The conservative prefix proof accepts `/`, `./`, `../`, `#`,
`https://`, and `http://`. Dynamic values, other URL forms, custom elements, and client artifacts
keep their existing runtime behavior. Attribute HTML escaping remains mandatory. Static stylesheet
elements can consequently join adjacent static head markup without an independent server writer.

An integration test exposed duplicate URL attributes when a static attribute preceded a spread.
Server spread attributes now resolve authored object-spread precedence before serialization,
including explicit `undefined` and unsafe overriding URLs. This preserves final-value URL policy
and avoids browsers selecting an earlier duplicate attribute.

The controlled literal-asset fixture produced byte-identical 4,270-byte documents before and after
the compiler change. Per request, URL sanitization calls fell from four to zero, compiled native
attribute calls from 15 to 11, and program writer executions from 24 to 22. Prepared program
creation remained 18, and hydration remained 745 bytes with one publication.

Eight fresh-process encoded-string screens used 50,000 warmup renders and 20,000 measured renders,
reversing variant order. Bun elapsed time improved from about 23.81 to 22.54 microseconds and from
24.18 to 22.84 microseconds. Node was mixed: 24.68 to 23.12 microseconds, then 24.07 to 24.26.
These screens support the simpler compiled work, not a stable Node throughput claim.

Validation included native compiler tests/build, 363 SSR tests in 57 files, type checking,
architecture and JSDoc checks, frozen ABI checks, and 56 browser checks across four runtime/output
cells. A final optional-prop fixture refinement and absent/undefined-spread regression test passed
the focused 12-test document suite and type checking. ESLint passed the final fixture/test files.
The browser checks additionally retain the original server-rendered application DOM element and
verify its identity after interaction.

Normal benchmark source was restored and its rebuilt Node/Bun artifacts retained their previous
SHA-256 hashes. Its asset URLs are dynamic, so the larger combined-shell diagnostic improvements
must not be attributed to this production compiler change. No ABI epoch or helper signature changed.

Raw screens, counters, build/test logs, browser artifacts, compiler source, and reproduction scripts
are included in [the evidence archive](combined-shell-2026-09-10-evidence.zip).
