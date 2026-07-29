# eXact Language Tools for VS Code

This extension presents the semantic model produced by the pinned eXact
compiler. It starts `@exactjs/language-server` beside VS Code's TypeScript
extension and adds eXact-specific diagnostics, semantic tokens, hovers,
CodeLens, inlay hints, document symbols, refactors, region markers, a component
semantics tree, and a read-only compiler-separation view.

The extension does not parse or classify eXact source. All semantic labels,
reasons, edits, and diagnostics come from `@exactjs/compiler`.

Compiler execution is enabled only in trusted workspaces. Source and inspection
data remain local. Presentation settings never change compiler meaning.
