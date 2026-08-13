import type { Component } from '@exactjs/core';
import { CodeBlock } from '../CodeBlock.jsx';
import { Article } from './Article.jsx';

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

const markerSource = `{
  "dependencies": {
    "@exactjs/component-library": "^0.1.0"
  },
  "exactComponentLibrary": {
    "protocol": 1,
    "build": "./dist/exact-component-build.json"
  }
}`;

const pairingSource = `import { readExactComponentAuthorizationIdentity } from '@exactjs/component-library-policy';
import { exact } from '@exactjs/vite-plugin';

const componentAuthorization = await readExactComponentAuthorizationIdentity(
  'dist/server/.exact/component-library-authorization.json'
);

export default {
  plugins: [exact({ componentAuthorization })]
};`;

/** Explains package participation and bundler-owned server execution authorization. */
export function ComponentLibraryTrustPage(this: Component<{}>) {
	return () => (
		<Article
			eyebrow="Component libraries"
			title="Authorize before execution"
			description="eXact build adapters combine compiler component facts with the physical package graph they resolved. The shared policy admits reviewed component libraries before evaluation and leaves client-only code outside this additional server boundary."
			previous={{ path: '/components/accessibility', label: 'Accessibility' }}
			next={{ path: '/components/motion', label: 'Motion' }}
		>
			<section>
				<h2>One application policy</h2>
				<p>
					The default <code>trusted</code> mode admits compatible direct dependencies, explicit
					packages and scopes, official eXact libraries, and production dependencies delegated by an
					already authorized library. A deny rule always wins. Rules may constrain a resolved
					package version or lockfile integrity.
				</p>
				<CodeBlock source={policySource} language="ts" title="exact.config.ts" />
			</section>
			<section>
				<h2>Participation is inert</h2>
				<p>
					Library authors publish a production marker dependency and static protocol-1 build facts.
					The marker has no JavaScript entry, lifecycle, registration, or trust grant. Build tools
					validate both files as data without importing candidate component code.
				</p>
				<CodeBlock source={markerSource} language="json" title="package.json" />
			</section>
			<section>
				<h2>The bundler is authoritative</h2>
				<p>
					Vite/Rollup, Webpack, Bun, Vitest, and Jest enforce the same policy before server
					evaluation. Successful server builds emit a compact authorization manifest and a redacted
					audit under <code>.exact/</code>. Client-only component code requires no additional eXact
					authorization.
				</p>
				<p>
					Validated package build facts become part of the active component graph. Packaged
					component and enhancement imports are recursively authorized even when their parent
					package remains external to the server bundle.
				</p>
				<p>
					Development revalidates the complete last-committed candidate set when policy or package
					inputs change. A rejected generation cannot replace the active graph and recovers normally
					after the input is corrected.
				</p>
				<p>
					Participation metadata is validated once per resolved package instance in each generation,
					and every generation-owned cache is released on commit or rejection. Build-only telemetry
					reports value-free entry counts for performance verification; none enters runtime output.
				</p>
				<p>
					When server inspection catalogs are enabled, they include that redacted decision data
					under the same build key. It is available only through the authorized DevTools path and is
					never emitted into client code.
				</p>
				<p>
					Paired hydration and retained remote artifacts carry only the manifest protocol, build
					key, and fingerprint. A mismatch follows the existing unsupported-build recovery path;
					package and policy provenance stays server-private.
				</p>
				<CodeBlock source={pairingSource} language="ts" title="vite.config.ts" />
				<p>
					This authorizes ordinary in-process JavaScript; it is not a sandbox. Framework-plugin
					discovery is a separate decision even when one package offers both roles.
				</p>
			</section>
		</Article>
	);
}
