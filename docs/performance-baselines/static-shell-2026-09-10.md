# Static outer shell diagnostic, September 10, 2026

Status: diagnostic only. Normal application source and both server bundles were
restored before measurement. Application components and hydration data are
generated for every request in every eXact variant.

## Variants

- Normal: retained production renderer and authored Document component.
- Literal assets: the Document uses four literal asset elements instead of
  parsing clientTags and mapping script and stylesheet arrays. The compiler
  still generates the document, head, body, and component programs normally.
- Static shell: hoisted document prefix and suffix surround the live IncidentApp
  renderer and fresh hydration publication. This bypasses the Document component,
  shell markers, and shell prop publication as well as asset mapping.
- React: unchanged normal application-owned document, using each runtime's
  existing renderer and transport.

The static variant is an upper-bound diagnostic for removing shell work, not an
isolated measurement of asset parsing. Its string path uses the existing
hydratable string renderer. Its stream path wraps the existing progressive
application stream, sends the prefix first, and appends the suffix after completion.
The latter includes an extra stream wrapper and the application's automatic
exact-root wrapper. Neither application HTML nor hydration scripts are cached.

## HTTP results

Mean successful requests per second across four interleaved blocks per variant:

| Runtime / mode | Normal eXact | Literal assets | Static shell | React | Static vs normal |
| --- | ---: | ---: | ---: | ---: | ---: |
| Node string | 7,390 | 8,019 | 9,074 | 10,478 | +22.8% |
| Node stream | 5,357 | 6,651 | 6,771 | 4,098 | +26.4% |
| Bun string | 10,249 | 11,268 | 14,016 | 10,700 | +36.8% |
| Bun stream | 7,737 | 8,344 | 8,978 | 7,710 | +16.0% |

Static-shell eXact trails React by 13.4% on Node string, and leads by 65.2% on
Node stream, 31.0% on Bun string, and 16.4% on Bun stream in this capture.
It improves on normal eXact in all four blocks of every cell. Literal assets
improve in three of four blocks on Node and four of four on Bun.

The PC remained in active use. These are short diagnostic comparisons, not new
published baselines or precise causal improvement estimates. Node showed visible
drift between blocks. Cross-capture absolute rates should not be pooled.

Each cell uses independent warmed servers, ten-second warmups, four rotated
orders, and 1.5-second measurement blocks. Two load drivers each use concurrency
16. Node 26.8.1 and Bun 1.4.2 use production environment and their normal Node HTTP
and Bun Fetch adapters. All owned processes run below normal priority. No builds,
tests, or profilers run during measurement. There are 823,263 valid measured
responses, zero errors, and complete per-response byte/hash identity checks.

## Output and correctness

| Response | Normal eXact | Literal assets | Static shell | React |
| --- | ---: | ---: | ---: | ---: |
| String bytes | 4,672 | 4,270 | 3,756 | 3,660 |
| Stream bytes | 4,672 | 4,270 | 3,880 | 3,660 |

Eighteen separate portable-renderer checks cover three changing request titles,
three eXact variants, and both modes. They verify complete document framing,
four assets in the head, equivalent application DOM after removing framework
markers, and parseable hydration JSON containing the changed request data.
For these modified-title requests, hydration JSON is 745 bytes for normal and
literal-assets variants and 495 bytes for the static shell. Removing Document
also removes its root prop metadata, so these gains include smaller publication
and response size. The application still renders on every request.

This does not certify browser adoption of the diagnostic output. Static asset
URLs are benchmark fixtures, and the raw shell's ownership, marker, cancellation,
and client entry contracts need integration coverage before any production design.
No production renderer or public API change was adopted by this experiment.

## Work attribution follow-up

Separate counted runs, excluded from timings, execute the portable renderer once
per variant and mode. Both modes give the following counts:

| Work per request | Normal | Literal assets | Static shell |
| --- | ---: | ---: | ---: |
| Prepared render program creations | 22 | 18 | 14 |
| Render program writer executions | 24 | 24 | 16 |
| Compiled child range creations | 4 | 2 | 2 |
| Direct component executions | 8 | 8 | 7 |
| Selected direct frame creations | 3 | 3 | 3 |
| Scheduled component constructions | 0 | 0 | 0 |
| Scheduled sibling preparation checks | 6 | 6 | 5 |
| Hydration script generation | 1 | 1 | 1 |
| Hydration validation entry calls | 1 | 1 | 1 |

Hydration is generated directly, not submitted as a task. All emitted component
execution classifications in this bundle are synchronous. There is one task
observer scope in every variant, and passive sibling scheduling checks remain,
but no scheduled component construction. Task machinery is therefore not the
explanation for hydration generation in this workload. Function invocation counts
are not allocation counts or measured costs.

The compiler's `staticDocumentProgramChild` retains boundaries needed by client
adoption. `unsupportedPlannedHost` excludes scripts and document hosts from nested
static coalescing. `staticRenderProgramAttribute` excludes URLs from literal
markup, including literal stylesheet hrefs, because it shares conservative
DOM/SSR semantics and leaves URL policy to runtime. Literal assets are therefore
hoisted prepared invocations, but still execute four separate writers per request.

The browser entry reads published Document props and adopts Document, including
its assets. That explains why normal publication includes clientTags. This is
not a second copy of the application data generated by a task. A better server
plan can preserve client identities while reducing server traversal, rather than
requiring server execution to mirror the client adoption structure. Known URL
literals should be eligible for compile-time validation; dynamic URL values still
require server policy before their HTML reaches the browser.

A bounded single-entry cache for each pure asset parsing helper was measured
separately. It preserves normal rendering, asset maps, markers, and hydration.
Normal and candidate full output must match byte-for-byte before the HTTP blocks.
The protocol matches the earlier string cells, with 458,828 valid responses and
zero errors:

| Runtime / string | Normal | Reused parsed assets | Static shell control | React control |
| --- | ---: | ---: | ---: | ---: |
| Node | 6,701 | 6,834 | 7,923 | 9,847 |
| Bun | 10,081 | 10,728 | 13,783 | 10,384 |

The parsing-only change is +2.0% on Node (three of four blocks improve) and +6.4%
on Bun (four of four). It leaves most of the static-shell gap in this capture.
These blocks are not pooled with the earlier capture, and the helper cache was
not integrated into production.

A second isolated variant replaces only the literal-assets head writer with one
precomputed span through the existing sink. The head host owner and head flush
remain. It preserves the Document component, application rendering, all output
identities, and the complete hydration JSON. Six changing-request checks compare
full response bytes in both modes; native runtime HTTP responses also match the
literal-assets control before measurement. This is a hand-specialized generated
artifact, not a general compiler implementation or proof of limit semantics.

| Runtime / string | Literal-assets control | Coalesced head | Static shell control | React control |
| --- | ---: | ---: | ---: | ---: |
| Node | 7,995 | 7,699 | 11,209 | 9,822 |
| Bun | 11,371 | 12,026 | 13,407 | 10,874 |

There are 507,531 valid responses and zero errors. Bun improves 5.8% in the mean
and in all four blocks. Node improves in three blocks but one large reversal
puts the mean 3.7% below control. That is not a reliable Node win. Head-only
coalescing therefore does not establish that static asset programs explain the
remaining gap. These separate captures continue to show substantial PC drift.

The final isolation replaces Document's generated render body with one shell
writer around the live IncidentApp reference. It retains Document as the root,
its publication schema and props, all emitted HTML identities, the head flush,
and html/head/body host ownership. Six changing-request comparisons match the
literal-assets control byte-for-byte in both modes. Counted writer executions
drop from 24 to 17, while hydration remains 745 bytes. This diagnostic is a
hand-specialized artifact, with no general compiler or browser contract change.

| Runtime / string | Literal-assets control | One-program Document | Static shell control | React control |
| --- | ---: | ---: | ---: | ---: |
| Node | 8,304 | 8,061 | 8,777 | 9,965 |
| Bun | 11,699 | 12,564 | 14,043 | 10,605 |

There are 505,348 valid responses and zero errors. Bun improves 7.4%, in every
block. Node's mean is 2.9% lower despite three of four blocks improving, again
with a large last-block reversal. No stable Node improvement is established.
This preserves the output-size and hydration contract, so it is stronger evidence
for reducing server program partitioning on Bun than the original raw-shell
comparison. It does not explain the entire remaining raw-shell advantage.

The user's subsequent architectural clarification distinguishes the requested
application component from an enclosing framework shell. A framework-provided
static shell should not acquire hydration state merely by enclosing that root.
The current benchmark explicitly requests Document and the browser explicitly
adopts Document, so its published shell props follow today's authored contract.
Changing that requires separating document ownership from hydration ownership:
the shell can own HTML delivery while IncidentApp owns application hydration.
An authored shell with reactive behavior still needs the corresponding state and
adoption. Removing shell publication alone without migrating the browser root
would invalidate the existing benchmark's hydration contract.

## Interpretation and evidence

Shell handling is a material optimization target. Even literal assets alone help
in this capture, and bypassing the remaining shell component and publication work
helps further. The next implementation investigation should identify which
static shell and asset work can be compiler-hoisted or omitted while preserving
normal authored components, dynamic document behavior, and browser hydration.

The archived scripts, frozen measured server bundles, raw HTTP blocks, output
verification, analysis, and build logs are in
[the evidence archive](static-shell-2026-09-10-evidence.zip). Its manifest records
SHA-256 hashes for every member. The source and canonical server bundle hashes
were verified restored; task-owned benchmark processes exited.
