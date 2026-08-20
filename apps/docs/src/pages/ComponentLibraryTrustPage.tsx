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
					Vite, Webpack, Bun, Vitest, and Jest enforce the policy before server code runs. A rejected
					package produces a build error that names the package and matching rule.
				</p>
				<p>
					Development builds recheck packages when dependencies or policy change. Production builds
					write a redacted audit under <code>.exact/</code> for deployment review.
				</p>
			</section>

			<Callout title="Authorization allows in-process code">
				<p>
					This policy approves a package to run with your server&apos;s process permissions. The package
					runs without isolation, so review its code and dependencies as you would any server
					dependency.
				</p>
			</Callout>
		</Article>
	);
}
