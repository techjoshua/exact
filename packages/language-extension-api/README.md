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
[compiler-aware language tools](https://github.com/techjoshua/exact/blob/main/docs/language-tools.md) for application policy and the
[language contribution protocol](https://github.com/techjoshua/exact/blob/main/docs/language-contribution-protocol.md) for
the complete protocol and security model.

[Documentation](https://techjoshua.github.io/exact/#/learn/language-tools) | [Source on GitHub](https://github.com/techjoshua/exact/tree/main/packages/language-extension-api)
