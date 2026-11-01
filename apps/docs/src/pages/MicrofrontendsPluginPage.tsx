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
			description="Load components from independently built and deployed eXact applications."
			previous={{ path: '/plugins/secrets', label: 'Secrets' }}
			next={{ path: '/learn/language-tools', label: 'Language tools' }}
		>
			<section>
				<p>
					Browser imports from <code>@exactjs/microfrontends</code> select the client runtime. Build
					and gateway APIs remain available to Node tools. Hosts load shared runtime providers when
					remote bindings are configured.
				</p>
				<h2>Load a separately deployed component</h2>
				<p>
					A billing team may need to release its account panel independently of the product
					dashboard that displays it. eXact lets the panel live in a separately built and deployed
					application, called a <strong>remote</strong>. The remote exposes a component. The
					dashboard configures where to load it and which server handles its tasks. eXact supplies
					the loading and task forwarding between them.
				</p>
			</section>
			<section>
				<h2>Expose a component from a remote application</h2>
				<CodeBlock source={remoteProducerSource} language="ts" title="billing/exact.config.ts" />
				<p>
					The build compiles the exposure and its reachable artifacts, generates a canonical remote
					entry, and records a build key. <code>providedPackages</code> describes packages whose
					identity must be bridged between page and remote rather than duplicated casually. The
					bundler also bridges the compiler-selected eXact runtime capability subpaths used by the
					generated artifact, including specialized reactive and component construction helpers.
					Remote state and page observers share one dependency graph. You do not need to list these
					framework imports yourself. The page includes the provider bootstrap when it has
					configured remote bindings. When a new remote requires additional providers, deploy the
					updated host bootstrap first.
				</p>
				<p>
					Use named or default imports for provided packages. A namespace import may access
					statically named exports. Dynamic imports of provided packages, dynamic namespace
					indexing, and passing the entire namespace to another function are unsupported.
				</p>
			</section>
			<section>
				<h2>Configure a remote in the host application</h2>
				<CodeBlock source={remoteConsumerSource} language="ts" title="page/exact.config.ts" />
				<p>
					The browser receives only the client entry binding it needs. The private endpoint remains
					a server concern. The eXact gateway authenticates the request and forwards its original
					payload, cookies, and authorization headers. Each service authenticates independently.
					Applications may add agreed service credentials through the forwarding header hook. An
					integrity pin is enforced by the browser before the generated module executes. Without
					one, the configured entry URL is intentionally trusted executable code. Replacement
					resolvers should return both the new URL and its generation-specific integrity.
				</p>
			</section>
			<section>
				<h2>Render the remote component</h2>
				<CodeBlock source={remoteComponentSource} language="tsx" title="BillingSlot.tsx" />
				<p>
					<code>RemoteComponent</code> loads and validates the generated registration, establishes
					an isolated execution root, passes props and children, and owns disposal. A binding change
					replaces the remote generation. Failed or stalled loads render the supplied fallback.
					Unmounting stops that component's wait without cancelling a load shared by another
					boundary.
				</p>
				<p>
					The component domain exposes only its immutable <code>executionRoot</code> identity.
					Framework transport, resumption, inspection, and activation capabilities stay behind the
					rendering and hydration boundary.
				</p>
				<p>
					Server rendering emits this browser-owned wrapper as a compiler-owned client boundary. It
					does not run the remote loader on the server. If a remote build or cross-root patch
					replaces the remote ancestor, page-authored children keep their existing instances, state,
					contexts, and lifecycle ownership while the renderer reattaches them beneath the
					replacement.
				</p>
			</section>
			<section>
				<h2>Handle updates and unavailable remotes</h2>
				<p>
					A mounted wrapper owns its remote entry wait. Removing it cancels that wait while other
					wrappers sharing the load can continue. The loader imposes no deadline or concurrency
					ceiling. Direct callers of <code>loadExactRemoteModule()</code> can supply an
					<code>AbortSignal</code> to choose their own cancellation policy.
				</p>
				<p>
					Remote entries carry a content-derived build key. When a server reports that a browser's
					build is no longer supported, the client can resolve a current entry, replace the remote
					module, and preserve the page-owned root around it. Cross-root structural patches rotate
					the remote component descriptor instead of pretending two independently built trees are
					one local bundle.
				</p>
				<p>
					The application's <code>resolveClientEntry(preferredBuild)</code> callback discovers a
					replacement entry. It receives no <code>AbortSignal</code>, so removing the remote does
					not cancel that discovery work. Arrange any discovery cancellation or deadline through
					your own application policy. After the callback returns an entry, the framework owns the
					module wait and prevents a retired boundary from installing a late result.
				</p>
				<p>
					A server-executing remote also carries its compact component-library authorization
					fingerprint. Operation requests must match the retained remote build before dispatch. A
					mismatch uses the same bounded replacement flow without exposing package provenance to the
					browser.
				</p>
			</section>
			<section>
				<h2>Build with Vite, Webpack, or Bun</h2>
				<p>
					Vite/Rollup, Webpack 5, and Bun emit and consume the same exposure, registration,
					provided-package, build, and recovery records. Webpack prepares entries from
					<code>ExactWebpackPlugin</code>. Bun producers use <code>exactBuild()</code> because its
					asynchronous plan must add entrypoints before <code>Bun.build</code> starts.
				</p>
				<CodeBlock source={bunProducerSource} language="ts" title="build.ts" />
				<p>
					Both adapters publish only complete successful entry maps and preserve reachable CSS,
					assets, and lazy chunks. Bun builds use native metadata to support custom hashed output
					names. The coordinator requests the metadata needed to publish those URLs automatically.
					Bun server <code>--hot</code> remains unsupported. Use watch or a coordinated rebuild so
					the last authorized generation remains unambiguous.
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
					shape and versioned executable contracts. It is not a sandbox for hostile code.
				</p>
			</Callout>
		</Article>
	);
}
