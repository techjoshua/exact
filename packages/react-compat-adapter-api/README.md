# eXact React compatibility adapter protocol

Adapters declare inert substitution metadata in `package.json`; discovery never
imports adapter code. An adapter must directly depend on this package and may
only target its own public exports.

```json
{
  "dependencies": { "@exact/react-compat-adapter-api": "^1.0.0" },
  "exact": {
    "reactCompatibility": {
      "schemaVersion": 1,
      "substitutions": {
        "some-react-binding": {
          "version": ">=1 <2",
          "exports": {
            "Provider": { "subpath": "./react", "export": "Provider" }
          }
        }
      }
    }
  }
}
```

The source must be a bare, non-framework package specifier; every source export
and target export is explicit. The target subpath must appear in the declaring
adapter's `exports` map. Native root modules should depend only on the
framework-neutral source core. Put compatibility-facing wrappers in isolated
leaf exports and mark the package `sideEffects: false`.

Run `exact-react-compat validate .` after building an adapter. Applications can
disable a transitive adapter using
`exact.reactCompatibility.ignoreAdapters` in the build-root `package.json`.
Use `exact-react-compat report .` to inspect the effective frozen registry.
