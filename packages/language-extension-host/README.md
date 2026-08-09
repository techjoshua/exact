# @exactjs/language-extension-host

`@exactjs/language-extension-host` discovers relevant package language declarations, enforces the
application's analyzer policy, and runs trusted analyzers outside the compiler and language-server
processes. It is shared development-time infrastructure for editor tooling and build validation; it
never runs in a browser.

## Application policy

Application authors configure analyzer trust and shared diagnostic policy through
`languageExtensions` in `exact.config.ts`. Most applications consume this package indirectly through
eXact's language server or build adapters.

## Build validation

The exported `createExactLanguageValidationSession()` is the common compilation boundary used by
the compiler and Vite, Webpack, and Bun. It accepts compiler projections, discovers only their
relevant packages, applies shared ignore and severity policy, and rejects a candidate generation on
an enabled provider error. Adapter authors should use that session rather than invoking analyzers
or recreating package discovery.
