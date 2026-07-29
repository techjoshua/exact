# Using the VS Code eXact extension

Keep this package a presentation and process-startup boundary. Request
structured compiler facts from `@exactjs/language-server`; never add an
extension-local eXact parser or classifier.

Respect `vscode.workspace.isTrusted` when starting semantic analysis. Apply
only generation/version-bound workspace edits returned by the language server.
Keep region decorations optional and restrained, and use the structured custom
requests for the semantics tree rather than parsing hover Markdown.
