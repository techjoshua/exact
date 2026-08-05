# @exactjs/bun-plugin

Bun build integration for eXact TypeScript and TSX.

## Configuration

```ts
import { exact } from '@exactjs/bun-plugin';

const result = await Bun.build({
	entrypoints: ['./src/client.tsx'],
	outdir: './dist',
	target: 'browser',
	format: 'esm',
	splitting: true,
	plugins: [exact({ target: 'client' })]
});
```

Use `target: 'server'` with Bun's server target for the matching server build. Keep
`serverComponents`, React compatibility, and build identity consistent across paired outputs.

## What the plugin handles

The plugin compiles eXact source, resolves generated `.exact` facades, selects client or server
exports, and participates in Bun watch builds. Use `@exactjs/bun-adapter` separately to connect
the generated server runtime to `Bun.serve()`.

Attributed enhancement imports populate the application-bundle enhancement catalog. The plugin
redirects DOM, hydration, and SSR entry points through the shared facades that supply that catalog;
the compiler does not decide package trust or maintain a plugin registry.

Optional `debug` settings control private server catalogs and compact browser instrumentation.
Disable both for hardened output. See [eXact DevTools](../../docs/devtools.md).
