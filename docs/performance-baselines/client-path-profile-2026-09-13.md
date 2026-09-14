# Client startup and optimistic feedback investigation, September 13, 2026

This investigation supplements [the post-audit client baseline](client-audit-2026-09-13.md).
It does not replace public chart values or change production code.

## Findings

The baseline FCP means are 43.87 ms for eXact and 38.80 ms for SvelteKit. Their optimistic
feedback means are 1.623 and 1.323 ms. Feedback is a MutationObserver observation of the owner
text changing after the claim click, not a measurement of the subsequent screen paint.

### Startup

The production eXact entry transfers 202,772 JavaScript bytes, including transfer overhead,
versus SvelteKit's 97,118 bytes. Separate baseline startup diagnostics report 16.89 ms versus
4.20 ms of scripting at native CPU speed. Those profiles cover readiness, not just pre-FCP work.

Eight fresh-context traces per framework at 6x CPU throttling show eXact's entry module executing
before FCP. Its module evaluation averages 19.78 ms under that instrumentation. SvelteKit has no
`v8.evaluateModule` duration before FCP in these traces; its inline startup script does execute.
Do not interpret the absence of module evaluation as zero startup work.

The eXact sampled stacks before FCP include root configuration parsing, JSON validation,
root-props decoding, client-root creation, and deferred hydration activation. The application
calls `readPublishedRootProps` before `hydrateAfterNavigation`, so deferring hydration does not
also defer all prerequisite work. Hydration activation can begin before the FCP marker; the
helper promises a rendering opportunity, not a guaranteed contentful paint before activation.

A separate native-speed control uses twelve fresh contexts per framework and condition, balanced
framework and condition order, disabled HTTP cache, and the same replayed HTML and assets. Both
conditions intercept the document identically; the control removes executable script elements
while retaining JSON data scripts. It checks that the incident heading remains present.

| Mean FCP                   |    eXact | SvelteKit |
| -------------------------- | -------: | --------: |
| Executable scripts present | 42.33 ms |  38.33 ms |
| Executable scripts removed | 39.00 ms |  38.67 ms |

The gap shrinks from 4.00 ms to 0.33 ms. This supports startup JavaScript as a substantial
contributor. The control disables all application execution, so it does not assign the saving
specifically to bundle size, validation, or hydration. CSS and document structures remain
framework-specific. Small populations and frame-quantized FCP also limit precision.

### Claim interaction

The same sixteen CPU traces include explicit capture-phase click, fetch-dispatch, and
owner-text mutation marks. Each trace records the first claim after live-service readiness.

| Mean under 6x throttling and tracing      |   eXact | SvelteKit |
| ----------------------------------------- | ------: | --------: |
| Click to fetch dispatch                   | 6.41 ms |   3.65 ms |
| Fetch dispatch to observed optimistic DOM | 6.16 ms |   8.16 ms |

The direction of the pre-dispatch difference repeats the uninstrumented baseline (0.667 versus
0.373 ms). Under tracing, eXact performs less work between dispatch and the observed DOM update.
These diagnostic times are perturbed and must not be divided by six to estimate native timings.
Fetch dispatch is a useful marker inside the event handler, not an exclusive boundary between
state processing and DOM processing. SvelteKit also wraps fetch, so the preceding interval includes
its wrapper before reaching the installed marker.

Source-mapped eXact pre-dispatch samples include the reactive proxy setter, dependency tracking,
transaction merging, computation validation, event wrappers, and application code. The proxy
setter accounts for 7.93 ms of sampled self time across all eight traces, making it the largest
individually attributed framework site in that interval. This is sampled evidence, not an exact
function timer or proof that the setter alone explains the gap. Focus preservation also appears,
but is not a dominant sampled cost.

The eXact app updates existing incident fields in a nested batch. SvelteKit replaces the incident
through an array update. Thus the paths differ in both application operations and framework
propagation. The extra synchronous work cannot fairly be described as a pure DOM-renderer cost.

## Recommended next work

1. Reduce work required before the first contentful paint. Investigate separating root-props
   preparation and hydration execution from the initial entry, while preserving early-interaction
   activation and validation. Retain required trust-boundary checks.
2. Measure redundant notifications and transaction merging on the existing-instance update path.
   Check whether no-op writes and nested batches can avoid bookkeeping without changing observable
   state, rollback, dependency, or interaction semantics. Do not replace normal instance mutation
   with an application-local workaround solely to improve this fixture.
3. Validate any candidate with separate native-speed, balanced controls before refreshing charts.

These profiles do not implicate the server adaptive admission scheduler. Client reactive scheduling
is part of the observed path, but this evidence does not justify changing its policy or deleting
ownership and validation work.

## Evidence and limitations

The [evidence archive](client-path-profile-2026-09-13-evidence.zip) contains sixteen traces,
forty-eight completed FCP control samples, replay identities, HTML, analysis scripts, and a source map.
A separate sourcemap-only build produced JavaScript byte-for-byte identical to the measured eXact
bundle, verified by SHA-256. Framework mappings resolve to built package modules; compiler-generated
application mappings can be coarse, so application function-level attribution is not asserted.

An initial FCP control using browser-wide JavaScript disabling could not obtain the paint entry
through the chosen wait helper and was abandoned. The completed control removes executable scripts
from the document instead. No result from that failed attempt enters the reported population.
All servers and browser contexts are owned and closed in finally blocks. Public baseline artifacts
and framework source were preserved.
