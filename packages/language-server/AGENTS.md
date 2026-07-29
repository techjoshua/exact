# Using the eXact language server

Use this package for LSP lifecycle and presentation only. Import compiler-owned
inspection and refactor contracts from `@exactjs/compiler`; do not infer eXact
semantics from source text in this package.

Keep every response tied to the latest document version and compiler generation.
Use stale-result suppression for cancelled and superseded analysis instead of publishing it. Dispose every
workspace service during folder removal and shutdown.

Prefer standard LSP capabilities. Add a custom request only when structured
component semantics cannot be represented by an existing protocol feature.
Project inlay metadata only at line edges, never inside an authored token.
Keep badge labels compact and put classifications and inference evidence in
their hover content.
Do not access negotiated capability getters before `initialize`; register
workspace-folder change listeners from `onInitialized` only when the client
advertised support.
Never execute workspace configuration, binaries, or plugins when the client
reports an untrusted workspace.
