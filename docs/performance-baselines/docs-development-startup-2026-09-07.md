# Docs development first-load investigation

The docs Vite server reported readiness after 1.17 seconds, but a fresh browser took 25.83 seconds
to show the landing page. Reloading the same server took 0.37 seconds. This reproduced the reported
long first load independently of production SSR and browser performance benchmarks.

## Cause and ownership

The navigation manifest imported almost every article component eagerly. Search and the sidebar
also imported that manifest. Opening the landing page therefore reached unrelated guides, demos,
and their dependencies. Vite compiles requested source modules on demand; listening on a port does
not mean that this graph has been transformed. The eXact transform performs synchronous compiler
work, which also delays delivery of already-built runtime modules on that server's event loop.
Small runtime module requests waited over 23 seconds in the initial trace.

This eager graph is an application loading decision. The docs now keep article metadata independent
of runtime component imports and select articles through a named finite component registry. The
landing article remains eager; the remaining articles use scoped lazy imports. Keys retain compiler
checking and registry-owned lifecycle behavior. The old two-article registry is subsumed by this one.

A separate framework declaration defect surfaced when exporting the inferred registry key type:
the mapped readonly lazy-entry alias exposed an unnameable symbol during declaration checking.
Making the lazy-entry contract a named interface preserves its readonly shape and gives declaration
emit a stable type name. A core declaration-emission test and docs composite type checking cover it.

## Measurements and experiments

Node 26.8.1, Windows, existing workspace package outputs, fresh owned Vite servers and Chromium pages:

| Configuration                                    | Server ready | First page | Reload |
| ------------------------------------------------ | -----------: | ---------: | -----: |
| Eager article imports                            |       1.17 s |    25.83 s | 0.37 s |
| Lazy article registry                            |       1.24 s |     7.62 s | 0.31 s |
| Lazy registry, repeat                            |       1.13 s |     7.06 s | 0.33 s |
| Lazy registry, synchronous transform attribution |       1.16 s |     7.47 s | 0.27 s |

An explicit prebundle experiment for core, DOM, and theme measured 9.32 seconds and triggered an
additional dependency-optimization reload. It was not retained. The attribution run recorded
6.26 seconds inside synchronous eXact transform calls, so the remaining delay is largely transform
work. Moving that work into server warmup would change when the wait happens; reducing it requires
profiling compiler analysis, emission, and source-map work, and examining reuse across transforms.
An asynchronous compiler transport could keep asset delivery responsive but would not itself remove
the compilation cost required for the page.

The browser resource buffer in the original probe retained only its first 250 entries. It must not
be interpreted as the full original request count. The confirmation probe increased the buffer and
recorded 391 resources. Instrumentation and local host conditions limit precision; the repeated
large reduction supports the loading change, not a claim of universal startup times.

## Deployment and verification

Production still disables code splitting and inlines JavaScript, CSS, article modules, and assets
into exactly one `apps/docs/dist/index.html`. Lazy development imports do not create deployment
chunks. All 39 routes and a counter interaction passed in development and when opening that single
file directly. The standalone navigation pass made no HTTP or external file requests.

Cold-load traces, experiment scripts, and navigation results are local artifacts under
`.tmp/docs-cold-load` and are excluded from commits. These development measurements do not replace
the independently captured production performance charts.
