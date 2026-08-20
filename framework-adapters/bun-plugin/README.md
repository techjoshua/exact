# @exactjs/bun-plugin

Bun build integration for eXact TypeScript and TSX.

## Configuration

```ts
import { exact } from '@exactjs/bun-plugin';

const exactPlugin = exact({ target: 'client' });
try {
	const result = await Bun.build({
		entrypoints: ['./src/client.tsx'],
		outdir: './dist',
		target: 'browser',
		format: 'esm',
		splitting: true,
		plugins: [exactPlugin]
	});
} finally {
	await exactPlugin.dispose();
}
```

When the eXact configuration declares microfrontend exposures, use the asynchronous coordinator so
the artifact plan can add its entrypoints before `Bun.build` begins:

```ts
import { exactBuild } from '@exactjs/bun-plugin';

await exactBuild({
	entrypoints: ['./src/client.tsx'],
	outdir: './dist',
	target: 'browser',
	format: 'esm',
	splitting: true
});
```

`exactBuild()` installs `exact()` automatically. It emits actual exposure entry URLs through
`onRemoteEntries` only after a complete successful generation and offers stable development IDs
through `onRemoteDevelopmentEntries`. Direct `Bun.build({ plugins: [exact()] })` remains supported
for ordinary builds and reports an actionable error if exposures require the coordinator.
`exactBuild()` always releases its compiler resources after the build settles. A host that installs
`exact()` directly must retain the plugin and call its idempotent `dispose()` after the final build
or watch generation, including when `Bun.build()` rejects.

Use `target: 'server'` with Bun's server target for the matching server build. Keep
`serverComponents`, React compatibility, and build identity consistent across paired outputs.
For browser builds, set `renderMode: 'hydrate'` when the entry adopts SSR HTML or
`renderMode: 'client'` when it only performs fresh mounts. The default `universal` contract remains
available when one output must support either mode.

## What the plugin handles

The plugin compiles eXact source, resolves generated `.exact` facades, selects client or server
exports, and participates in Bun watch builds. Use `@exactjs/bun-adapter` separately to connect
the generated server runtime to `Bun.serve()`.

The repository's release workflow runs the native `Bun.build`, `Bun.serve`, and Bun test-runner
integration suites on Bun 1.3.5; packaging is gated on that job.

Server builds authorize compiler-reached component packages before their `onLoad` hooks run and
write private authorization and audit manifests under `.exact/`. Configure the shared policy with
`componentLibraries` in `exact.config.*`. Bun server `--hot` is rejected because Bun cannot yet
preserve a last-valid authorization generation; use watch builds instead.

Attributed enhancement imports populate the application-bundle enhancement catalog. The plugin
redirects DOM, hydration, and SSR entry points through the shared facades that supply that catalog;
the compiler does not decide package trust or maintain a plugin registry.
An attributed namespace export with `scope: 'package'` in `exact.config.*` supplies a virtual namespace to
every package component; Bun emits its catalog registration only from modules that activate it.

Optional `debug` settings control private server catalogs and compact browser instrumentation.
Disable both for hardened output. See [eXact DevTools](../../docs/devtools.md).
