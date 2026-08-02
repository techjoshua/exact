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

const enhancementSource = `import motion from '@exactjs/motion'
  with { type: 'exact-plugin' };

<article motion:apply={fade} motion:layout-id={card.id} />;`;

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
				<h2>Optional JSX remains ordinary component behavior</h2>
				<CodeBlock source={enhancementSource} language="tsx" title="Card.tsx" />
				<p>
					An attributed value import establishes only the local prefix. The compiler derives a
					finite canonical prop schema, rejects unknown and reserved members, and emits one grouped
					reactive marker. Statically finite setup-derived spreads are partitioned without runtime
					prefix scanning. An active trusted host mounts an ordinary inspectable component; an
					unavailable optional enhancement leaves the target unchanged.
				</p>
				<p>
					Compilation records attributed capabilities without a plugin registry because a library
					cannot know the final application's bundle policy. The application either bundles that
					package capability or does not; package inclusion is the activation trust decision.
				</p>
				<p>
					The Vite adapter links compiler-emitted module fragments into a bundle-local DOM catalog and
					passes it into each renderer root.
					Low-level callers can still provide an explicit catalog when constructing a host directly.
				</p>
				<p>
					The reserved <code>namespace:root</code> member reactively selects the first matching
					logical descendant as the enhancement target. When that selection changes, the renderer
					reroutes only the affected declaration subtree and releases the previous enhancement
					instance while preserving the authored DOM.
				</p>
				<p>
					Ordinary context production and consumption orders components before setup. Unrelated
					capabilities use canonical identity, while a context cycle fails through normal component
					error handling before any component in the cycle runs.
				</p>
			</section>
			<section>
				<h2>The plugins in this repository</h2>
				<div className="card-grid">
					<Link className="topic-card" to="/plugins/motion">
						<span className="topic-index">Visual behavior</span>
						<strong>Motion</strong>
						<p>Animate committed state with prepared definitions and task-owned playback.</p>
					</Link>
					<Link className="topic-card" to="/plugins/gestures">
						<span className="topic-index">Semantic input</span>
						<strong>Gestures</strong>
						<p>Recognize pointer and keyboard intent with bounded component-owned sessions.</p>
					</Link>
					<Link className="topic-card" to="/plugins/physics">
						<span className="topic-index">Deterministic simulation</span>
						<strong>Physics</strong>
						<p>
							Advance owned 2D worlds and project coalesced body poses without coupling input or
							motion.
						</p>
					</Link>
					<Link className="topic-card" to="/plugins/gravity">
						<span className="topic-index">Force policy</span>
						<strong>Gravity</strong>
						<p>Compose pure finite acceleration fields through the physics force seam.</p>
					</Link>
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
