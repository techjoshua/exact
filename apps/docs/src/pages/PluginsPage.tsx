import type { Component } from '@exactjs/core';
import { Link } from '@exactjs/router';
import { CodeBlock } from '../CodeBlock.jsx';
import { Article } from './Article.jsx';

const pluginConfigSource = `export default {
  plugins: {
    // Each installed plugin owns a typed configuration transform.
    microfrontends(config) {
      config.providedPackages.push('@acme/design-system');
    },
    secrets(config) {
      config.required.push('DATABASE_URL');
    }
  }
};`;

/** Explains the validated compiler, runtime, rendering, and testing plugin lifecycle. */
export function PluginsPage(this: Component<{}>) {
	return () => (
		<Article
			eyebrow="Extend eXact"
			title="Plugins across every layer"
			description="Configure packages that add application-wide features such as translation, secrets, and remote components."
			previous={{ path: '/components/gravity', label: 'Gravity' }}
			next={{ path: '/plugins/internationalization', label: 'Internationalization' }}
		>
			<section>
				<h2>Add an application-wide feature</h2>
				<p>
					Some features need configuration shared by the whole application. For example, translation
					needs a list of languages and catalogs, while secrets need credential providers on the
					server. A plugin packages that setup and connects it to the build and runtime. Install the
					package for the feature you need, then configure it in <code>exact.config.ts</code>.
				</p>
			</section>
			<section>
				<h2>Configure an installed plugin</h2>
				<p>
					Installed plugins contribute their options to <code>exact.config.ts</code>. Configure them
					there so your build tools and server use the same settings. eXact discovers the plugins
					from their packages and checks compatibility before application code runs. Vite and
					Webpack watch sessions pick up a newly created configuration file as well as later edits
					or removal. Bun reads the configuration again on each build. ESM configuration files are
					evaluated afresh, with relative imports and module paths based on the authored file.
					Ordinary JavaScript configuration can load from a read-only directory. Imported
					dependencies keep the runtime’s normal module cache. Discovery stays inside the selected
					workspace, including child directories whose names begin with two dots.
				</p>
				<CodeBlock source={pluginConfigSource} language="ts" title="exact.config.ts" />
				<p>
					Configuration transforms may mutate the provided value or return a replacement. Generated
					type augmentation makes installed plugin keys available through
					<code>@exactjs/config</code>.
				</p>
				<p>
					eXact validates the configuration before using it, so misspelled options and invalid
					plugin settings produce setup errors. Multiple build tools can read the same
					configuration. Use <code>.ts</code> or <code>.mts</code> for TypeScript ESM configuration.
					Configuration syntax is prepared with TypeScript 7, and callbacks run normally in your
					build tool. Validation preserves your values and callback identities, including callback
					state or metadata. Readonly restrictions come from TypeScript. You can write it in
					TypeScript and include enhancement declarations from packages.
				</p>
			</section>
			<section>
				<h2>Choose a plugin</h2>
				<p>
					Component-library enhancements are also documented under
					<Link to="/components/enhancements">Enhancements</Link>. Internationalization uses both:
					enhancement attributes mark messages in your components, and the plugin extracts those
					messages and loads the configured translation catalogs.
				</p>
				<div className="card-grid">
					<Link
						theme:surface="raised"
						theme:interactive
						className="topic-card"
						to="/plugins/internationalization"
					>
						<span className="topic-index">Build + enhancement</span>
						<strong>Internationalization</strong>
						<p>
							Extract enhancement-authored messages, exchange XLIFF catalogs, infer semantic
							formatters, and load only reachable locale data.
						</p>
					</Link>
					<Link
						theme:surface="raised"
						theme:interactive
						className="topic-card"
						to="/plugins/microfrontends"
					>
						<span className="topic-index">Build + runtime</span>
						<strong>Microfrontends</strong>
						<p>
							Compile explicit exposures, bind trusted remotes, share packages, mount logical child
							roots, and recover across deployments.
						</p>
					</Link>
					<Link
						theme:surface="raised"
						theme:interactive
						className="topic-card"
						to="/plugins/secrets"
					>
						<span className="topic-index">Policy + server</span>
						<strong>Secrets</strong>
						<p>
							Load required values from providers and preserve compiler-visible secret qualification
							until an audited consume boundary.
						</p>
					</Link>
				</div>
			</section>
			<section>
				<h2>How a plugin connects to the application</h2>
				<div theme:surface="raised" className="definition-grid">
					<code>config</code>
					<p>Defines defaults, validation, typed transforms, and host-specific projections.</p>
					<code>build</code>
					<p>
						Contributes bundler-owned configuration and package capabilities without installing
						compiler callbacks.
					</p>
					<code>server</code>
					<p>Initializes application- or request-owned resources and server projections.</p>
					<code>render</code>
					<p>Validates or transforms rendered output at explicit output boundaries.</p>
					<code>client</code>
					<p>Provides browser-safe configuration or runtime initialization.</p>
					<code>testing</code>
					<p>Supplies deterministic test-host behavior for the same concern.</p>
				</div>
				<p>
					Build and language projections accept JSON-safe data, including shared sibling references
					that serialize as copies. Cycles remain invalid. A plugin declares only the entries it
					needs. Host projections are loaded for the relevant mode, so a server implementation does
					not become browser code by accident. Preparation has no automatic deadline. Hosts may pass
					a cancellation signal or choose an explicit <code>timeoutMs</code>. Async configuration
					callbacks receive a signal so they can release their own work when preparation stops.
					Contexts, metadata, and reports follow TypeScript readonly guarantees.
				</p>
				<p>
					When writing an output transform or validator, match the boundary's execution mode.
					Synchronous boundaries require synchronous hooks. Returning a promise prevents
					publication, and the host observes any later rejection. Async boundaries await the hook
					before publishing validated output.
				</p>
				<p>
					If resource initialization fails, the host releases resources it already acquired in
					reverse order. If cleanup also fails, the reported aggregate retains the initialization
					error as its cause alongside cleanup failures.
				</p>
			</section>
		</Article>
	);
}
