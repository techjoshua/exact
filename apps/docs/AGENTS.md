# Maintaining the eXact documentation app

Treat the docs app as the public learning guide. Add every routable article to
`src/docs-manifest.ts` so navigation, search, SSR route collection, and the standalone build see
the same page inventory. Keep previous/next links consistent with manifest order.

When a framework proposal lands, update its status ledger, the authoritative engineering
reference under `docs`, affected package READMEs and AGENTS guides, and the corresponding public
article together. State deferred boundaries explicitly; do not present proposal-only behavior as
available.
