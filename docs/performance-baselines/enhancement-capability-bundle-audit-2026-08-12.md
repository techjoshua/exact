# Enhancement capability bundle audit — 2026-08-12

This record measures moving the optional DOM enhancement host behind compiler-resolved provider
facades. It is a controlled comparison of the framework-comparison eXact client at commit
`3d4f874bc25124bcf1bfd6671c9f09a3d3b274ba`, before and after the uncommitted implementation,
using the same Vite production configuration and installed dependency graph.

Whole-output compression used Node's `gzipSync` and `brotliCompressSync` against the minified entry
chunk. Module attribution used Rollup's `renderedLength` before minification; those module figures
explain reachability and must not be added to predict compressed savings.

| Client JavaScript               |    Before |     After |              Change |
| ------------------------------- | --------: | --------: | ------------------: |
| Raw                             | 236,595 B | 229,020 B |   -7,575 B (-3.20%) |
| Gzip                            |  68,650 B |  66,657 B |   -1,993 B (-2.90%) |
| Brotli                          |  59,654 B |  57,933 B |   -1,721 B (-2.88%) |
| DOM rendered-module attribution | 158,164 B | 141,998 B | -16,166 B (-10.22%) |

The enhancement-free entry no longer reaches `renderer/enhancements`, `enhancement-chain`,
`enhancement-targets`, or the enhancement installer. It retains the 927-byte unminified capability
bridge and the independent `_target` routing implementation. The audit's enhancement-and-target
family fell from 28,026 to 11,056 unminified bytes; the remaining 11,056 bytes are principally
ordinary target contribution/routing support rather than the optional enhancement host.

A Vite integration fixture mounts a base root and exposes an enhancement component through a
dynamic import. Its static entry closure excludes `renderer/enhancements`; the dynamic closure
contains it and evaluates the provider facade's installer before exporting the component. A DOM
behavior regression also creates a root before dynamically importing the installer, then mounts an
enhancement-bearing replacement successfully. Together these checks demonstrate that the removed
bytes move with a lazy or microfrontend component instead of becoming an undeclared main-bundle
requirement.

The comparison participant now rejects production builds that retain the enhancement host when no
enhancement is authored. This makes the measured absence a maintained bundle boundary rather than
a one-time observation.
