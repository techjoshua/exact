# Using the eXact language server

Use this package for LSP lifecycle and presentation only. Import compiler-owned
inspection and refactor contracts from `@exactjs/compiler`; do not infer eXact
semantics from source text in this package.

Keep every response tied to the latest document version and compiler generation.
Use stale-result suppression for cancelled and superseded analysis instead of publishing it. Dispose every
workspace service during folder removal and shutdown.

Prefer standard LSP capabilities. Add a custom request only when structured
component semantics cannot be represented by an existing protocol feature.
For JSX component references, project the compiler's render-expression entity
and tag selection range; never substitute the containing component's placement
or infer placement from TypeScript hover text.
Emit semantic tokens only for precise identifiers with a TypeScript-compatible
standard base type. Never place an eXact token over keywords, JSX tags,
inferred `await` sites, punctuation, or complete property-access expressions.
Project inlay metadata only at line edges, never inside an authored token.
Compose badge label parts by semantic fact, give each part a focused hover, omit
default facts when that reduces noise, and keep the complete classification and
inference evidence in the combined hover.
Do not access negotiated capability getters before `initialize`; register
workspace-folder change listeners from `onInitialized` only when the client
advertised support.
Never execute workspace configuration, binaries, or plugins when the client
reports an untrusted workspace.
