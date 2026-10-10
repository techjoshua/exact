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
			previous={{ path: '/plugins/internationalization', label: 'Internationalization' }}
			next={{ path: '/plugins/secrets', label: 'Secrets' }}
		>
			<section>
				<h2>Set one application policy</h2>
				<p>
					Installing a UI library can also introduce code that runs on your server during rendering
					or a server task. That code has the process’s permissions, including access to resources
					you would not expose to the browser. eXact requires an application policy that names the
					component libraries you have reviewed and approved for server execution. Client-only
					packages do not need this authorization. Components in your application's own package are
					application-owned, even when its package.json has no name or version. External packages
					still need complete package metadata.
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
					Consumers need browser and server builds, TypeScript declarations, and enough information
					to apply their authorization policy. You should not need to maintain a custom compiler
					script to produce those files.
				</p>
				<p>
					Component libraries and enhancement providers can use <code>exactc build-library</code>
					from <code>@exactjs/compiler</code>. The builder emits declarations, client and server
					modules, optional enhancement facades, and the static metadata used by this policy. Add
					the inert <code>@exactjs/component-library</code> marker to production dependencies.
				</p>
				<p>
					Declare shared framework runtimes as compatible peer dependencies, and install them as
					development dependencies for the library&apos;s own tests and build. The builder accepts
					peers, dependencies, and optional dependencies for generated imports. Peers need the
					consumer&apos;s own authorization and do not inherit the library&apos;s delegated trust.
				</p>
				<p>
					An interactive library owner may need an SSR publication import even when its source does
					not import SSR. Declare <code>@exactjs/ssr</code> as a compatible runtime peer when the
					builder reports that requirement.
				</p>
				<p>
					The Vite, Bun, and Webpack adapters share the application&apos;s installed
					<code>@exactjs/</code> packages with linked libraries, including libraries that contain
					another physical copy. This keeps state, contexts, and enhancements in one runtime. An
					optional provider installed only by the library remains available through that library.
					Export conditions and explicit bundler aliases still select implementations, and server
					authorization and exclusion rules still apply.
				</p>
				<p>
					Build the library before generating the consumer&apos;s component artifacts and hydration
					registration. Libraries built with compiler 0.7.1 publish the information needed for the
					consumer&apos;s generated registry to discover their interactive components, enhancement
					providers, and transported tasks. You can place those components in a server page without
					adding an interactive wrapper solely to make the library hydrate. Rebuild an older library
					to publish this information, then regenerate the consumer&apos;s artifacts.
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
					previous contents on failure. If the library needs a separate TypeScript configuration,
					you can select it with <code>--project tsconfig.types.json</code>. If your pipeline
					already emits declarations, <code>--skip-declarations</code> skips that step. For
					subpaths, map each export path to its component names in
					<code>exactCompiledComponents</code>.
				</p>
				<p>
					Compiler-owned fragments and structural tags, including <code>_</code>,
					<code>Fragment</code>, and <code>Activity</code>, describe rendering operations. They do
					not require component-library participation. Components imported from other packages still
					follow the normal authorization policy, even when their names match.
				</p>
				<p>
					The selected TypeScript configuration determines the source roots, including its
					<code>include</code>, <code>exclude</code>, and <code>files</code> settings. JavaScript
					roots require <code>allowJs</code>. Test files and test-support directories are excluded
					from publication. Production imports of those sources fail the build, so move shared
					helpers into production source. Use <code>exactCompileModules</code> to select an explicit
					module list. Imported production sources are compiled as dependencies, even when
					<code>exclude</code> removes them from the project&apos;s initial source roots. Each
					compiled component needs a proven placement. If an opaque helper leaves it unresolved, the
					build fails before replacing your output. Verify the helper and provide its execution
					contract.
				</p>
				<p>
					The default build writes declarations at the output root and executable ESM modules in the
					paired target directories. NodeNext <code>.mts</code> and <code>.mjs</code> sources keep{' '}
					<code>.mjs</code> outputs, including package entry points. Point paired exports at those
					files. CommonJS <code>.cts</code> and <code>.cjs</code> compilation is unsupported.
					Declaration paths must not overlap target directories. For example, with{' '}
					<code>src/server/</code> and declarations directly in <code>dist/</code>, rename the
					targets through <code>exactTargetDirectories</code>.
				</p>
				<p>
					A declaration-only directory such as <code>dist/types</code> stays shared between the two
					targets. Package self-imports into <code>dist/</code> are checked against the new build,
					including on the first build. Client checks select browser exports. When calling the
					library-build API from Bun, keep Node on <code>PATH</code> for export checks. Build
					staging and rollback files live in the package&apos;s
					<code>.exact/</code> cache.
				</p>
				<p>
					The builder checks your sources with eXact&apos;s typing rules and emits declarations from
					their authored signatures. Function-defined tasks retain access to their component state,
					and invalid state assignments fail the build. Components can compose private children
					through finite registries without exposing each child as a public package export.
				</p>
				<p>
					Publish both module trees and their metadata from one successful build together. Generated
					identities and enhancement facades currently depend on the source checkout&apos;s physical
					path, so a fresh build elsewhere may differ byte for byte. Moving a completed package
					preserves its generated identities. Retain the release tarball when you need to verify
					exactly what shipped.
				</p>
				<p>
					During local development, run <code>exactc build-library --watch</code> alongside the
					consuming dev server. It rebuilds paired artifacts after source or configuration changes
					and retains the last successful generation after invalid edits. Imported JSON also
					triggers a rebuild. Run your separate asset pipeline for CSS changes. The consumer must
					watch the published files or restart after a completed build if its bundler caches linked
					dependencies. Stop the watcher with Ctrl+C so active work finishes and resources close.
				</p>
				<p>
					Wait for the first successful library build before starting consumer SSR. If the server
					imports separately generated application artifacts, regenerate them after library
					publication and before reloading its SSR module graph. Requests can then use a completed
					generation throughout. Library imports are checked under the current application policy on
					each rebuild, including internal component imports when the consumer stays cached. Vite
					coordinates overlapping reloads and keeps renderer enhancements available when a request
					retains an earlier SSR module. Installed participating libraries stay in Vite's SSR module
					graph automatically, without an application-authored <code>ssr.noExternal</code> list. The
					adapter also preserves library enhancement activation and shared framework runtime
					instances during browser development. Policy denials still fail under the current
					configuration.
				</p>
				<p>
					To publish library CSS, keep an author-owned <code>styles/</code> directory in
					<code>files</code>, export <code>./styles.css</code> from the package manifest, and mark
					CSS as a side effect with <code>{'"sideEffects": ["**/*.css"]'}</code>. A consumer can
					import <code>@your-scope/kit/styles.css</code> in its browser entry. Its application build
					publishes that asset, including when the TSX entry contains JSX helpers. The compiler
					treats stylesheet imports as client assets and omits their execution from server
					artifacts. The library builder does not bundle CSS or create an HTTP stylesheet route.
				</p>
				<p>
					Package-scoped enhancement namespaces belong to the source package&apos;s
					<code>exact.config.*</code>, even when a consumer compiles that source. Only static
					namespace declarations are read from a dependency&apos;s config. The consumer continues to
					own authorization and application plugins.
				</p>
				<p>
					Helper definitions remain available when a component artifact needs them. Declaring a
					function does not execute its body. Its DOM calls still belong in browser work, such as an
					event handler, client task, or client lifecycle callback.
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
