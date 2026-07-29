# eXact Language Tools for VS Code

This extension presents the semantic model produced by the pinned eXact
compiler. It starts `@exactjs/language-server` beside VS Code's TypeScript
extension and adds eXact-specific diagnostics, semantic tokens, hovers,
CodeLens, inlay hints, document symbols, refactors, region markers, a component
semantics tree, and a read-only compiler-separation view.

The extension does not parse or classify eXact source. All semantic labels,
reasons, edits, and diagnostics come from `@exactjs/compiler`.
Only `EXACT`-namespaced framework diagnostics are presented by this extension;
ordinary TypeScript squiggles remain owned by VS Code. Asynchronous eXact
results are version-fenced so adding or removing an error is reflected by that
edit rather than the following one.

Hovering an authored JSX component tag presents the referenced component's
compiler-resolved placement and boundary. This distinguishes, for example, a
client child element from the server component that contains it while leaving
VS Code's TypeScript symbol information intact.

Semantic modifiers are applied only to compatible identifier tokens:
component functions, explicit task/action methods, and derived variables.
Keywords, JSX tags, inferred `await` sites, punctuation, and surrounding
property-access syntax retain VS Code's normal TypeScript/theme highlighting.

Assignment metadata appears before the assignment; task and action metadata
appears immediately after the call's opening parenthesis. `⚙` marks the
particular assignment that initializes state, while `⚡` marks a deferred
reactive assignment or inferred work. Composable call badges add kind (`📋`,
`▶`), placement (`🖥`, `📱`, `⇄`), deferred priority (`⏳`), and immediate
publication (`🚨`).

Region markers and eXact source hovers are limited to selected operation spans.
They do not decorate the entire containing function, leaving TypeScript type and
signature hovers available within task callbacks and component setup.

Compiler execution is enabled only in trusted workspaces. Source and inspection
data remain local. Presentation settings never change compiler meaning.

## Run from this repository

From the repository root, build the language server and extension and open a
fresh Extension Development Host with:

```sh
npm run dev:vscode-extension
```

The launcher supports `--code code-insiders`, `--workspace <path>`,
`--skip-build`, and `--dry-run`. `EXACT_VSCODE_COMMAND` may also select another
VS Code CLI. A development host prefers the freshly built sibling
`packages/language-server`; packaged extensions fall back to their installed
dependency. No local `node_modules` junction or copy synchronization is needed.
