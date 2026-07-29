# Using the VS Code eXact extension

Keep this package a presentation and process-startup boundary. Request
structured compiler facts from `@exactjs/language-server`; never add an
extension-local eXact parser or classifier.

Respect `vscode.workspace.isTrusted` when starting semantic analysis. Apply
only generation/version-bound workspace edits returned by the language server.
Keep ordinary TypeScript diagnostics owned by VS Code and rely on the language
server's immutable document snapshot fence for eXact diagnostic publication.
Keep region decorations optional and restrained, and use the structured custom
requests for the semantics tree rather than parsing hover Markdown.
Keep referenced-component hover presentation scoped to the compiler-provided JSX
tag range and render-edge classification. Do not derive child placement from
imports or TypeScript hover text in the extension.
Do not compensate for broad or incompatible server semantic tokens in the
extension. The language server must preserve TypeScript base token types and
omit framework tokens where no compatible identifier projection exists.
Preserve TypeScript token presentation: compiler inlay metadata belongs at a
line edge. Preserve independently hoverable badge label parts supplied by the
language server and keep detailed meaning in the combined hover content.

Use `npm run dev:vscode-extension` from the repository root for development.
Keep the launcher responsible for building both process owners and opening the
Extension Development Host; keep dependency-layout resolution inside the
extension. Prefer the freshly built sibling workspace language server in
development and the installed dependency in packaged extensions; never require
hand-authored links or synchronization of copied dependency output.
