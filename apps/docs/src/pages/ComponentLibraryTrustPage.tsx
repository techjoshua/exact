import type { Component } from '@exactjs/core';
import { CodeBlock } from '../CodeBlock.jsx';
import { Article } from './Article.jsx';
import { Callout } from './Callout.jsx';

const policySource = `import { defineConfig } from '@exactjs/config';

export default defineConfig({
  componentLibraries: {
    mode: 'trusted',
    allow: [
      '@acme/maps',
      { package: '@vendor/charts', version: '^2.4.0' }
    ],
    deny: ['@unreviewed/'],
    trustedScopes: ['@company/']
  }
});`;

/** Explains how applications authorize component libraries for server execution. */
export function ComponentLibraryTrustPage(this: Component<{}>) {
	return () => (
		<Article
			eyebrow="Component libraries"
			title="Authorize server libraries"
			description="Choose which component packages may run during server rendering and server tasks."
			previous={{ path: '/components/accessibility', label: 'Accessibility' }}
			next={{ path: '/components/motion', label: 'Motion' }}
		>
			<section>
				<h2>Set one application policy</h2>
				<p>
					Server rendering executes package code in your process. Review component libraries before
					allowing them to run there. Client-only packages do not need this authorization.
				</p>
				<CodeBlock source={policySource} language="ts" title="exact.config.ts" />
				<p>
					Allow individual packages, version ranges, or trusted scopes. Deny rules take priority.
					You can also pin lockfile integrity for stricter deployments.
				</p>
			</section>

			<section>
				<h2>Use the same policy across tools</h2>
				<p>
					Vite, Webpack, Bun, Vitest, and Jest enforce the policy before server code runs. Vite also
					bundles authorized compiled components so optional enhancements resolve against your
					application's installed providers. A policy conflict produces a build warning naming the
					package and matching rule. The built app rejects that component before its code runs. Fix
					the policy and rebuild before deploying. Invalid package metadata still produces a build
					error.
				</p>
				<p>
					Development builds recheck packages when dependencies or policy change. Production builds
					write a redacted audit under <code>.exact/</code> for deployment review.
				</p>
			</section>

			<section>
				<h2>Build your own library</h2>
				<p>
					Component libraries and enhancement providers can use <code>exactc build-library</code>
					from <code>@exactjs/compiler</code>. The builder emits declarations, client and server
					modules, optional enhancement facades, and the static metadata used by this policy. Add
					the inert <code>@exactjs/component-library</code> marker to production dependencies.
				</p>
				<CodeBlock
					language="json"
					title="package.json build configuration"
					source={`{
  "scripts": { "build": "exactc build-library" },
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "browser": "./dist/client/index.js",
      "default": "./dist/server/index.js"
    }
  },
  "exactCompiledComponents": ["Button"],
  "exactComponentLibrary": {
    "protocol": 1,
    "build": "./dist/exact-component-build.json"
  }
}`}
				/>
				<p>
					Use an ESM package with source in <code>src/</code> and a TypeScript configuration that
					emits into <code>dist/</code>. The builder replaces that output directory and restores its
					previous contents on failure. Use <code>--project tsconfig.types.json</code> for a
					separate configuration, or <code>--skip-declarations</code> when your pipeline already
					emits TypeScript output. For subpaths, map each export path to its component names in
					<code>exactCompiledComponents</code>.
				</p>
				<p>
					The default build writes declarations at the output root and executable ESM modules in the
					paired target directories. NodeNext <code>.mts</code> and <code>.mjs</code> sources keep{' '}
					<code>.mjs</code> outputs; CommonJS <code>.cts</code> and <code>.cjs</code> compilation is
					unsupported. Declaration paths must not overlap target directories. For example, with{' '}
					<code>src/server/</code> and declarations directly in <code>dist/</code>, rename the
					targets through <code>exactTargetDirectories</code>.
				</p>
				<p>
					Export verification executes your compiled modules in Node during the build. Keep module
					initialization suitable for that environment. Runtime dependencies remain external, and
					optional enhancement imports keep their consumer-controlled no-op behavior. The builder
					reports missing generated runtime dependencies so you can declare them before publishing.
					Custom tooling can call <code>buildLibrary()</code> from
					<code>@exactjs/compiler/library-build</code> instead of maintaining a separate
					implementation.
				</p>
			</section>

			<Callout title="Authorization allows in-process code">
				<p>
					This policy approves a package to run with your server&apos;s process permissions. The
					package runs without isolation, so review its code and dependencies as you would any
					server dependency.
				</p>
			</Callout>
		</Article>
	);
}
