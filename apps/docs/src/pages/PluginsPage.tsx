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
			title="Plugins carry cross-cutting concerns through the whole system"
			description="An eXact plugin is a package contract, not a bag of component hooks. It can contribute typed configuration and validated behavior to compiler, server, render, client, or testing hosts."
			previous={{ path: '/guides/react-compatibility', label: 'React compatibility' }}
			next={{ path: '/plugins/microfrontends', label: 'Microfrontends' }}
		>
			<section>
				<h2>Why plugins exist</h2>
				<p>
					Concerns such as secrets, remote deployment, policy, tracing, or localization do not live
					cleanly inside one component. They may affect source analysis, generated artifacts, server
					startup, request lifetime, rendered output, browser boot, and tests. A plugin lets one
					package describe those parts without teaching each bundler or application a private
					integration protocol.
				</p>
			</section>
			<section>
				<h2>One package, several bounded hosts</h2>
				<div className="definition-grid">
					<code>config</code>
					<p>Defines defaults, validation, typed transforms, and host-specific projections.</p>
					<code>compiler</code>
					<p>
						Analyzes declared directives, emits diagnostics, and contributes bounded session-local
						analysis data.
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
			<section>
				<h2>Discovery and configuration are package-based</h2>
				<p>
					The host discovers plugin declarations from package metadata, resolves configuration
					contributors in deterministic dependency order, validates the final value, and
					fingerprints compiler-safe configuration for analysis and caches. Required plugin protocol
					mismatches fail before application code runs.
				</p>
				<CodeBlock source={pluginConfigSource} language="ts" title="exact.config.ts" />
				<p>
					Configuration transforms may mutate the provided value or return a replacement. Generated
					type augmentation makes installed plugin keys available through{' '}
					<code>@exactjs/config</code>.
				</p>
			</section>
			<section>
				<h2>The plugins in this repository</h2>
				<div className="card-grid">
					<Link className="topic-card" to="/plugins/microfrontends">
						<span className="topic-index">Build + runtime</span>
						<strong>Microfrontends</strong>
						<p>
							Compile explicit exposures, bind trusted remotes, share packages, mount logical child
							roots, and recover across deployments.
						</p>
					</Link>
					<Link className="topic-card" to="/plugins/secrets">
						<span className="topic-index">Policy + server</span>
						<strong>Secrets</strong>
						<p>
							Load required values from providers and preserve compiler-visible secret qualification
							until an audited consume boundary.
						</p>
					</Link>
				</div>
			</section>
		</Article>
	);
}
