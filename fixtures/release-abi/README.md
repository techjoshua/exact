# Component ABI fixtures

The versioned directories preserve compiler output for public ABI baselines. Compatibility tests
bundle these artifacts against the current runtime without invoking the compiler or regenerating
the files. Authored source is retained only to explain the observable contract under test.

The 0.5.0 baseline was published on September 14, 2026 and remains frozen. Its caller-owned SSR
writer contract superseded the earlier development artifacts before publication. Those
array-returning artifacts and their original integrity manifest are preserved verbatim in
[the development fixture archive](../../docs/performance-baselines/prepublication-array-writer-fixture-2026-09-10.zip).
This replacement is an incompatible prepublication redesign, not evidence of backward compatibility.

The 0.6.0 directory is the unpublished epoch-2 candidate baseline. The same authored workload is
compiled with component and render-program version 2. It exercises tasks, precise reactive updates,
keyed DOM identity, SSR, hydration, and disposal. The current check also verifies that epoch-1 artifacts
are rejected before construction. It never recompiles either baseline during validation.

Once published, never refresh a baseline to make a runtime change pass. Add a new baseline for a
major ABI generation and retain old fixtures for every supported generation.
