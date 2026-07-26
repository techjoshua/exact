# @exactjs/bun-plugin

Compiler integration for Bun's native bundler and runtime plugin pipeline. It transforms eXact
JSX, resolves `.exact` artifact facades, and adds the appropriate `exact-client` or `exact-server`
package export condition.

```ts
import { exact } from '@exactjs/bun-plugin';

const result = await Bun.build({
	entrypoints: ['./src/client.tsx'],
	outdir: './dist',
	target: 'browser',
	format: 'esm',
	splitting: true,
	sourcemap: 'external',
	plugins: [exact({ target: 'client' })]
});

if (!result.success) {
	for (const log of result.logs) console.error(log);
	process.exitCode = 1;
}
```

Use `target: "server"` together with Bun's `target: "bun"` when producing a server bundle. Keep
`serverComponents` consistent between paired client and server builds.

The plugin is integration-tested with Bun 1.3.5. Bun's plugin API requires unmatched `onLoad` and
`onResolve` hooks to return no value; the eXact plugin composes with later Bun loaders instead of
claiming modules that do not require an eXact transform.

HTTP request handling is separate. Use `@exactjs/bun-adapter` with `Bun.serve()` for eXact server
endpoints.

Set `reactCompatibility: { target: 18 }` or `{ target: 19 }` to render imported or
runtime-selected components directly from native eXact JSX. The compiler inserts a cached
compatibility adapter; compiler-branded eXact components pass through unchanged while unbranded
values use the active React layer. Bun redirects React runtime imports without eXact-compiling
dependency implementations. Reference the matching `@exactjs/react-compat/types18` or `types19`
facade for TypeScript.
