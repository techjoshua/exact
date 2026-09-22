# Component ABI fixtures

The versioned directories preserve compiler output for public ABI baselines. Compatibility tests
bundle these artifacts against the current runtime without invoking the compiler or regenerating
the files. Authored source is retained only to explain the observable contract under test.

The 0.5.0 baseline was published on September 14, 2026 and remains frozen. Its caller-owned SSR
writer contract superseded the earlier array-returning development artifacts before publication.
The obsolete development ZIP is not a compatibility fixture and is no longer retained. Earlier
compiler implementations remain in source history. This prepublication redesign is not evidence
of backward compatibility with development builds; the released fixture bytes below remain frozen.

The 0.6.0 directory is the unpublished epoch-2 candidate baseline. The same authored workload is
compiled with component and render-program version 2. It exercises tasks, precise reactive updates,
keyed DOM identity, SSR, hydration, and disposal. The current check also verifies that epoch-1 artifacts
are rejected before construction. It never recompiles either baseline during validation.

Once published, never refresh a baseline to make a runtime change pass. Add a new baseline for a
major ABI generation and retain old fixtures for every supported generation.
