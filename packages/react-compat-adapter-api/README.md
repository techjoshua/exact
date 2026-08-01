# @exactjs/react-compat-adapter-api

Contracts and validation helpers for packages that adapt React ecosystem libraries to eXact.

## Adapter metadata

Adapters declare inert substitution metadata under `exact.reactCompatibility` in
`package.json`. Each entry identifies the source package, supported version range, public source
export, and public adapter export. Discovery reads metadata without importing adapter code.

Use `fallback: 'retain'` when unrelated source exports may remain React-owned. Use
`fallback: 'error'` when an unmapped export would create a conflicting authority.

## Validation

```sh
exact-react-compat validate .
```

Adapter roots should depend only on framework-neutral source packages. Put React-facing wrappers
in isolated leaf exports and keep substitution ranges explicit and non-overlapping.

See [React ecosystem adapters](../../docs/react-ecosystem-adapters.md).
