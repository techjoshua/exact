import type { Component } from '@exactjs/core';
import { CodeBlock } from '../CodeBlock.jsx';
import { Article } from './Article.jsx';
import { Callout } from './Callout.jsx';

const remoteProducerSource = `export default {
  plugins: {
    microfrontends(config) {
      config.providedPackages.push('@acme/design-system');

      // Public exposure name -> component source root.
      config.exposes['./Billing'] = {
        component: './src/Billing.tsx'
      };
    }
  }
};`;

const remoteConsumerSource = `export default {
  plugins: {
    microfrontends(config) {
      config.providedPackages.push('@acme/design-system');

      // The public client entry and private operation endpoint are separate.
      config.remotes.billing = {
        clientEntry: 'https://cdn.acme.test/billing/remote.js',
        integrity: 'sha384-<deployment-generated-digest>',
        endpoint: 'https://billing.internal/__exact'
      };
    }
  }
};`;

const remoteComponentSource = `import { RemoteComponent } from '@exactjs/microfrontends/client';

function BillingSlot(this: Component<{}>) {
  const account = this.getContext(AccountContext);

  return () => (
    <RemoteComponent
      binding="billing"
      props={{ accountId: account.id }}
      fallback={<p role="alert">Billing is unavailable.</p>}
    />
  );
}`;

const bunProducerSource = `import { exactBuild } from '@exactjs/bun-plugin';

await exactBuild({
  entrypoints: ['./src/page.ts'],
  outdir: './dist',
  target: 'browser',
  format: 'esm',
  splitting: true
});`;

/** Documents microfrontend exposure, consumption, development, and recovery contracts. */
export function MicrofrontendsPluginPage(this: Component<{}>) {
	return () => (
		<Article
			eyebrow="Plugin / @exactjs/microfrontends"
			title="Components across deployments"
			description="The microfrontends plugin compiles named eXact component roots as remote entries and lets a host mount them through trusted bindings, without reducing the remote to an iframe or an untyped module factory."
			previous={{ path: '/plugins/internationalization', label: 'Internationalization' }}
			next={{ path: '/plugins/secrets', label: 'Secrets' }}
		>
			<section>
				<h2>Why this plugin exists</h2>
				<p>
					Independent teams need deployment boundaries, but the page still needs coherent component
					ownership, props, context, server tasks, package identity, failure handling, and upgrades.
					Those require cooperation from the compiler, bundler, hydration client, and server
					gateway—exactly the kind of cross-cutting concern the plugin system is designed to own.
				</p>
			</section>
			<section>
				<h2>A producer exposes explicit roots</h2>
				<CodeBlock source={remoteProducerSource} language="ts" title="billing/exact.config.ts" />
				<p>
					The build compiles the exposure and its reachable artifacts, generates a canonical remote
					entry, and records a build key. <code>providedPackages</code> describes packages whose
					identity must be bridged between page and remote rather than duplicated casually.
				</p>
			</section>
			<section>
				<h2>A consumer owns trusted bindings</h2>
				<CodeBlock source={remoteConsumerSource} language="ts" title="page/exact.config.ts" />
				<p>
					The browser receives only the client entry binding it needs. The private endpoint remains
					a server concern, where the eXact binding gateway validates and forwards task invocation
					and refresh traffic. An integrity pin is enforced by the browser before the generated
					module executes. Without one, the configured entry URL is intentionally trusted executable
					code; replacement resolvers should return both the new URL and its generation-specific
					integrity.
				</p>
			</section>
			<section>
				<h2>The page renders a normal component boundary</h2>
				<CodeBlock source={remoteComponentSource} language="tsx" title="BillingSlot.tsx" />
				<p>
					<code>RemoteComponent</code> loads and validates the generated registration, establishes
					an isolated execution root, passes props and children, and owns disposal. A binding change
					replaces the remote generation. Failed loads render the supplied fallback.
				</p>
				<p>
					The component domain exposes only its immutable <code>executionRoot</code> identity.
					Framework transport, resumption, inspection, and activation capabilities stay behind the
					rendering and hydration boundary.
				</p>
			</section>
			<section>
				<h2>Deployment recovery is part of the contract</h2>
				<p>
					Remote entries carry a content-derived build key. When a server reports that a browser's
					build is no longer supported, the client can resolve a current entry, replace the remote
					module, and preserve the page-owned root around it. Cross-root structural patches rotate
					the remote component descriptor instead of pretending two independently built trees are
					one local bundle.
				</p>
				<p>
					A server-executing remote also carries its compact component-library authorization
					fingerprint. Operation requests must match the retained remote build before dispatch; a
					mismatch uses the same bounded replacement flow without exposing package provenance to the
					browser.
				</p>
			</section>
			<section>
				<h2>Vite, Webpack, and Bun share one artifact contract</h2>
				<p>
					Vite/Rollup, Webpack 5, and Bun 1.3 or newer emit and consume the same exposure,
					registration, provided-package, build, and recovery records. Webpack prepares entries from
					<code>ExactWebpackPlugin</code>. Bun producers use <code>exactBuild()</code> because its
					asynchronous plan must add entrypoints before <code>Bun.build</code> starts.
				</p>
				<CodeBlock source={bunProducerSource} language="ts" title="build.ts" />
				<p>
					Both adapters publish only complete successful entry maps and preserve reachable CSS,
					assets, and lazy chunks. Bun server <code>--hot</code> remains unsupported; use watch or a
					coordinated rebuild so the last authorized generation remains unambiguous.
				</p>
				<p>
					<code>exactBuild()</code> releases its compiler resources after success or failure. A
					build host that installs <code>exact()</code> directly must retain the plugin instance and
					call its idempotent <code>dispose()</code> after the final build or watch generation.
				</p>
			</section>
			<Callout title="Trust boundary" tone="warning">
				<p>
					Remote endpoints are application-configured trusted systems. The plugin validates module
					shape and versioned executable contracts; it is not a sandbox for hostile code.
				</p>
			</Callout>
		</Article>
	);
}
