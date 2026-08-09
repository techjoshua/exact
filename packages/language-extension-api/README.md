# @exactjs/language-extension-api

`@exactjs/language-extension-api` defines the stable, serialized contracts used by trusted eXact
language-service contributions. It is a development-time Node package and is never part of an eXact
application's browser graph. Enhancement libraries and framework plugins use it when finite
declarative metadata is insufficient for their diagnostics, completion, hover, hints, or safe source
edits.

## Define an analyzer

```ts
import type { ExactLanguageAnalyzerFactory } from '@exactjs/language-extension-api';

export const createExactLanguageAnalyzer: ExactLanguageAnalyzerFactory = async (context) => ({
	diagnostics: async (request) => []
});
```

## Protocol boundary

Providers receive compiler-owned projections, not TypeScript compiler objects or an LSP connection.
Executable providers require explicit analyzer trust from the consuming application. See
[compiler-aware language tools](../../docs/language-tools.md) for application policy and the
[language contribution design](../../docs/proposals/trusted-language-service-contributions.md) for
the complete protocol and security model.
