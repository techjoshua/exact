# @exactjs/react-compat-adapter-api

Protocol and validation helpers for eXact React compatibility adapters.

Adapters declare inert substitution metadata in `package.json`; discovery never
imports adapter code. An adapter must directly depend on this package and may
only target its own public exports.

```json
{
	"dependencies": { "@exactjs/react-compat-adapter-api": "^0.1.0" },
	"exact": {
		"reactCompatibility": {
			"schemaVersion": 1,
			"substitutions": {
				"some-react-binding": {
					"fallback": "retain",
					"variants": [
						{
							"version": ">=1 <2",
							"exports": {
								"Provider": { "subpath": "./react", "export": "Provider" }
							}
						}
					]
				}
			}
		}
	}
}
```

The source must be a bare, non-framework package specifier. Variants are
ordered, must have non-overlapping semantic-version ranges, and are selected
from the actual source package instance resolved from the importer. Every source export
and target export is explicit. The target subpath must appear in the declaring
adapter's `exports` map. Native root modules should depend only on the
framework-neutral source core. Put compatibility-facing wrappers in isolated
leaf exports and mark the package `sideEffects: false`.

`fallback` defaults to `"retain"` for provider-style adapters that intentionally
leave unrelated exports on the source package. Use `"error"` when any unmapped
runtime export would create a second authority, as with routing.

Run `exact-react-compat validate .` after building an adapter. Applications can
disable a transitive adapter using
`exact.reactCompatibility.ignoreAdapters` in the build-root `package.json`.
Use `exact-react-compat report .` to inspect the effective frozen registry.
