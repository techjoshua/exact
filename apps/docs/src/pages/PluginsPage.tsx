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
					from their packages and checks compatibility before application code runs.
				</p>
				<CodeBlock source={pluginConfigSource} language="ts" title="exact.config.ts" />
				<p>
					Configuration transforms may mutate the provided value or return a replacement. Generated
					type augmentation makes installed plugin keys available through
					<code>@exactjs/config</code>.
				</p>
				<p>
					eXact validates the configuration before using it, so misspelled options and invalid
					plugin settings produce setup errors. Multiple build tools can read the same configuration.
					You can write it in TypeScript and include enhancement declarations from packages.
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
					A plugin declares only the entries it needs. Host projections are loaded for the relevant
					mode, so a server implementation does not become browser code by accident.
				</p>
			</section>
		</Article>
	);
}
