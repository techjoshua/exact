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
import { fade } from '@exactjs/motion/presets';

function ProductCard(this: Component<{}>, props: CardProps) {
  return () => <article className="product-card">{props.children}</article>;
}

// The card owns its design and required behavior. Motion is optional.
<ProductCard motion:apply={fade}>...</ProductCard>;`;

const enhancementExpansionSource = `// Conceptually, when the application bundles the capability:
<MotionElement apply={fade}>
  <ProductCard>...</ProductCard>
</MotionElement>

// When it does not, the authored fallback remains:
<ProductCard>...</ProductCard>`;

/** Explains the validated compiler, runtime, rendering, and testing plugin lifecycle. */
export function PluginsPage(this: Component<{}>) {
	return () => (
		<Article
			eyebrow="Extend eXact"
			title="Plugins carry cross-cutting concerns through the whole system"
			description="An eXact plugin is a package contract, not a bag of component hooks. It can contribute typed configuration and validated behavior to build, server, render, client, or testing hosts."
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
					integration protocol. The compiler independently records the language and renderer facts
					needed by those packages.
				</p>
			</section>
			<section>
				<h2>One package, several bounded hosts</h2>
				<div className="definition-grid">
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
				<h2>Enhancements package reusable wrapper behavior</h2>
				<CodeBlock source={enhancementSource} language="tsx" title="Card.tsx" />
				<p>
					An enhancement is an ordinary transparent component packaged so it can be attached without
					putting that wrapper into the component&apos;s required design. The authored component still
					owns its markup, state, accessibility, and fallback behavior. The enhancement owns one
					reusable cross-cutting concern such as motion, gesture recognition, pose projection, or a
					force contribution.
				</p>
				<CodeBlock
					source={enhancementExpansionSource}
					language="tsx"
					title="Conceptual runtime expansion"
				/>
				<p>
					The compiler does not literally rewrite source into that tree. It emits a typed marker, and
					the renderer mounts the package&apos;s inspectable wrapper at the resolved intrinsic root only
					when the final application includes that capability. Excluding it at bundle time removes the
					wrapper implementation while leaving the authored component intact. This separates reusable
					functionality from visual design and lets libraries declare optional behavior without deciding
					the final application&apos;s trust or bundle policy.
				</p>
				<p>
					The attributed import establishes only the local prefix. The compiler derives a finite
					canonical prop schema, rejects unknown and reserved members, and emits one grouped reactive
					marker. Direct values and finite setup-derived spreads retain the wrapper component&apos;s prop
					types without runtime prefix scanning.
				</p>
				<p>
					The VS Code extension recognizes the attributed binding as a use and completes finite
					members after a prefix such as <code>motion:</code>. Suggested names use the same
					kebab-case mapping as the compiler and include the reserved <code>root</code> target
					selector.
				</p>
				<p>
					Compilation records attributed capabilities without a plugin registry because a library
					cannot know the final application's bundle policy. The application either bundles that
					package capability or does not; package inclusion is the activation trust decision.
				</p>
				<p>
					The application host may prepare build and runtime plugin projections, but it passes only
					ordinary compile options to the compiler. Plugins cannot register compiler callbacks,
					directives, analysis payloads, or transforms.
				</p>
				<p>
					The Vite, Bun, and Webpack adapters link compiler-emitted module fragments into an
					application-bundle catalog and pass it to DOM, hydration, and SSR entry points. SSR runs
					available declarations as ordinary components at the resolved logical intrinsic target,
					including targets behind components, keyed lists, dynamic output, and the selected
					Suspense candidate. Hydration adopts authored DOM before activating the client catalog.
					Low-level renderer and component-test callers can provide the bundle-local catalog
					explicitly.
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
					error handling before any component in the cycle runs. The compiler projects statically
					known context token identities into that pre-setup contract. Exported helpers carry the
					same frozen contract, so callers compose helper-private tokens without importing them;
					compilerless packages can attach the generic contract explicitly.
				</p>
			</section>
			<section>
				<h2>The plugins in this repository</h2>
				<p>
					The <code>apps/plugin-playground</code> sample demonstrates these optional JSX
					capabilities on familiar controls: animated tabs, disclosures and toasts; semantic press,
					hover, long-press, slider, pan, pinch and keyboard input; plus a bounded, deliberately
					bouncy stage that composes motion, gestures, physics and gravity on one target.
				</p>
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
