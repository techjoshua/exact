# Native Intl capability selection correction

The Intl workload now completes client mount/update, string and stream SSR, and hydration.
Its earlier failure exposed a compiler defect, not a requirement for applications to import task
support manually.

Capability planning treated an unresolved preliminary package render edge as foreign unless the
host explicitly listed it as native. JSX emission had additional native proofs from TypeScript
symbols and published package facts. In the Intl fixture, emission selected a native child receipt
but planning gave `IntlReceiver` ABI 9 (`render | tasks`) and `compatibility` metadata. No foreign
receipt existed to select task integration, so the task constructor rejected construction.

Planning now uses the same component resolver as emission, including native package imports,
renamed imports, registry identity, and the separate dynamic-component path. The fixture's receiver
uses the render constructor without the false compatibility requirement. This is a compiler fix;
there is no new runtime registration, wrapper, or application workaround. Recompile affected
artifacts to obtain the corrected constructor selection. The artifact schema and ABI epoch remain
unchanged.

Native compiler coverage checks native-only package imports and renamed imports, while retaining
compatibility for a genuinely foreign child. A Vite integration test builds the real enhancement
benchmark fixtures and executes the Intl workload in a fresh Node process. It verifies updates,
unwrapped text, SSR, hydration identity, receiver counts, and disposal. Process isolation prevents
unrelated test imports from installing task support and masking the defect.

## Diagnostic benchmark

The existing protocol-2 benchmark completed every workload after the compiler correction. For Intl,
100 receivers and ten updates use 20 client warmups, 500 server warmups, and 21 measured samples
per isolated phase. No builds or tests ran concurrently with measurement. Node is 26.8.1; client
measurements use JSDOM. These are current medians, not a before/after speed comparison:

| Intl measurement  |    Median |
| ----------------- | --------: |
| Mount             |  6.803 ms |
| Ten updates       | 18.670 ms |
| Hydration         |  6.138 ms |
| String SSR        |  0.756 ms |
| Stream first byte |  0.772 ms |
| Complete stream   |  0.773 ms |

The fixture reports zero materialized span hosts, zero replaced hydration elements, 100 hydration
owners, and matching string/stream HTML sizes. Earlier failed captures remain unavailable; these
numbers must not be used to invent a historical Intl speedup or replace full framework charts.

Raw samples are retained in [the diagnostic capture](intl-capability-fix-2026-09-18.json).
Local build and validation logs are in `.tmp/intl-capability-fix`.

Validation passed: native compiler suites, 2,213 package tests (15 skipped), test type checking,
lint for changed TypeScript, source architecture, JSDoc, compiled ABI checks, and documentation
typecheck/build. The full package run includes the isolated-process regression test.
