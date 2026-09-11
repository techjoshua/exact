# Prepared keyed-program traversal, September 10, 2026

Status: rejected artifact experiment. Production sources and built applications are unchanged.

The generated `keyedChild` operation normalizes a prepared program into an array and forwards it
through generic child traversal. Unlike the earlier `child` shortcut, this operation reaches the
document's head, body, and application container programs. The hypothesis was a 1–4% complete-render
improvement from avoiding their intermediate arrays, child-group objects, and traversal targets.

An asserted bundle transformation detects a prepared program with an existing target and shared
sink. It retains the existing boundary writer, prepared-program renderer, node/depth accounting,
host ownership, and cleanup. Other values retain the original path. This is a diagnostic branch,
not a new compiler ABI or production implementation.

## Complete render and response consumption

Median microseconds per render, lower is better:

| Runtime/output | Retained eXact | Candidate | React | Candidate change | Faster pairs |
| --- | ---: | ---: | ---: | ---: | ---: |
| Node string | 30.61 | 31.03 | 29.65 | +1.4% | 1/6 |
| Node stream | 33.64 | 33.51 | 60.31 | -0.4% | 4/6 |
| Bun string | 29.90 | 29.57 | 38.64 | -1.1% | 4/6 |
| Bun stream | 46.88 | 46.39 | 56.48 | -1.1% | 4/6 |

Each cell covers all six variant orders in fresh processes, 72 populations total. Every process
warms 50,000 times and measures 20,000 complete renders. Node 26.8.1 uses the portable public
rendering entry and consumes a Web Response; Bun 1.4.2 uses the native participant response entry.
These are in-process measurements, not HTTP throughput. Node's Web Response consumption also
does not measure its native HTTP adapter. React is unchanged and uses its respective runtime entry.
All workers use production mode and priority 10, with no concurrent benchmark, build, or test job.
The user may use the PC. Local scheduling and GC remain sources of variation.

The shortcut is rejected: the remaining Node string case worsens in five of six pairs, while the
other changes are small and mixed. This is not a minimum-improvement rule. The evidence does not
justify an additional runtime path, and this experiment does not establish HTTP parity with React.

## Trace and correctness evidence

The branch executes three times per request. Generic child-group render calls fall from 21 to 18,
while component executions remain eight, render programs 24, and sink writes 89. This rules out an
inactive transformation as the explanation for the limited effect. It removes traversal setup,
but does not fuse render programs or remove their preparation and writer ownership.

Six changing-request comparisons cover string and streaming output with different application
titles, Unicode, script-like text, and asset URLs. Full output matches the retained bundle exactly.
All timed eXact populations have matching response hashes within each runtime and mode. Ready
string, ready stream, and an artificially pending head-flush trace also match their controls.
The injected pause is an instrumentation control, not evidence about real transport capacity.

No production integration, package suite, or browser suite is claimed for this rejected artifact.
Lifecycle, cancellation, enhancement, and limit coverage would be required before adopting a
general implementation. The current production bundles remain byte-identical to the retained
conditional-emission artifacts.

The next structural question remains how to reduce separately prepared shell programs while
preserving dynamic assets, adoption identities, and unchanged hydration ownership. The older
combined-shell prototype changes multiple factors and cannot answer that question by itself.

[Evidence archive](keyed-program-2026-09-10-evidence.zip) includes artifacts, scripts, fixture,
comparisons, traces, raw timings, and a SHA-256 manifest.
