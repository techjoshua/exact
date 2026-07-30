# Maintaining the eXact documentation app

Treat the docs app as the public learning guide. Add every routable article to
`src/docs-manifest.ts` so navigation, search, SSR route collection, and the standalone build see
the same page inventory. Keep previous/next links consistent with manifest order.

When a framework proposal lands, update its status ledger, the authoritative engineering
reference under `docs`, affected package READMEs and AGENTS guides, and the corresponding public
article together. State deferred boundaries explicitly; do not present proposal-only behavior as
available.

For compiler-aware language tools, keep the public route, navigation/search
metadata, no-emit compiler contract, LSP/VS Code ownership split, trust
boundary, task-refactor limitations, and package map aligned with
`docs/language-tools.md`.

For full-stack DevTools, keep build controls, `allowDebug`, redaction, catalog identity,
microfrontend federation, Chromium/agent read-only behavior, and package ownership aligned with
`docs/devtools.md`.

Present reactive and invoked work as activation modes of one function-defined task model. Keep
`TaskContext` policy, structured settlement, owner-bound status, cleanup/optimism, the versioned
library ABI, captured parameter defaults, and the framework frame SPI aligned with
`docs/tasks.md`. Distinguish tracked call arguments from generation-stable untracked defaults, and
do not restore separate authored task and action articles.
