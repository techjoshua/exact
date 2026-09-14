# Component ABI fixtures

The versioned directories preserve compiler output for public ABI baselines. Compatibility tests
bundle these artifacts against the current runtime without invoking the compiler or regenerating
the files. Authored source is retained only to explain the observable contract under test.

The first baseline, 0.5.0, is not yet published. The approved caller-owned SSR writer redesign
establishes its initial contract. The preceding array-returning development artifacts and their
original integrity manifest are preserved verbatim in
[the development fixture archive](../../docs/performance-baselines/prepublication-array-writer-fixture-2026-09-10.zip).
This replacement is an incompatible prepublication redesign, not evidence of backward compatibility.

Once published, never refresh a baseline to make a runtime change pass. Add a new baseline for a
major ABI generation and retain old fixtures for every supported generation.
