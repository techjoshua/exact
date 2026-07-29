# Using the VS Code eXact extension

Keep this package a presentation and process-startup boundary. Request
structured compiler facts from `@exactjs/language-server`; never add an
extension-local eXact parser or classifier.

Respect `vscode.workspace.isTrusted` when starting semantic analysis. Apply
only generation/version-bound workspace edits returned by the language server.
Keep region decorations optional and restrained, and use the structured custom
requests for the semantics tree rather than parsing hover Markdown.

Use `npm run dev:vscode-extension` from the repository root for development.
Keep the launcher responsible for building both process owners and opening the
Extension Development Host; keep dependency-layout resolution inside the
extension. Prefer the freshly built sibling workspace language server in
development and the installed dependency in packaged extensions; never require
hand-authored links or synchronization of copied dependency output.
