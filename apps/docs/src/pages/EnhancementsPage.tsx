import type { Component } from '@exactjs/core';
import { Link } from '@exactjs/router';
import { CodeBlock } from '../CodeBlock.jsx';
import { Article } from './Article.jsx';

const attributedSource = `import * as motion from '@exactjs/motion/enhancements'
  with { type: 'exact-enhancement' };

<ProductCard motion:fade motion:duration={180} />;`;

const packageScopeSource = `export * as intl from '@exactjs/intl/enhancements' with {
  type: 'exact-enhancement',
  scope: 'package'
};

export default defineConfig({});`;

const targetSource = `function Field(props: FieldProps) {
  return () => (
    <label className="field">
      <span>{props.label}</span>
      <_target aria-describedby={props.descriptionId}>
        {props.children}
      </_target>
      <small id={props.descriptionId}>{props.description}</small>
    </label>
  );
}`;

/** Explains optional ordinary-component enhancement composition. */
export function EnhancementsPage(this: Component<{}>) {
	return () => (
		<Article
			eyebrow="Component language"
			title="Compose optional behavior from ordinary components"
			description="Enhancements are component-library components selected through namespaced JSX. They keep their existing compiler metadata and optional bundle-time activation without becoming framework plugins."
			previous={{ path: '/guides/react-compatibility', label: 'React compatibility' }}
			next={{ path: '/components/accessibility', label: 'Accessibility' }}
		>
			<section>
				<h2>A namespaced component call</h2>
				<CodeBlock source={attributedSource} language="tsx" title="ProductCard.tsx" />
				<p>
					The attributed import is compile-only. Finite activators select ordinary components,
					shared props are sent to every selected component that declares them, and aliases of one
					canonical component still create one instance. The application bundle may include each
					identity through a compiler-authored provider facade. Missing or disabled providers select a
					shared pass-through and leave the authored output unchanged without constructing a component.
					An installed provider with an invalid export, failed evaluation, or denied server policy still
					fails contextually.
				</p>
				<p>
					This catalog is not plugin discovery. A component library needs no plugin manifest,
					configuration controller, or host lifecycle merely to provide enhancements.
				</p>
				<p>
					A package can mark a finite prop as <code>@exact analyzer-only</code> when it is typed
					source evidence rather than runtime component input. The compiler validates and projects
					the field for trusted tooling, then removes it without selecting an enhancement component;
					the package provider alone defines its meaning.
				</p>
			</section>
			<section>
				<h2>Portable optional providers</h2>
				<p>
					The compiler emits a canonical enhancement render node and a target-local facade import. Vite
					and Bun may keep the facade virtual; Webpack and native Node use ordinary generated ESM files
					under <code>.exact/enhancements</code>. Lazy component artifacts bring only their own reachable
					facades, so an optional provider does not leak into the eager page bundle.
				</p>
			</section>
			<section>
				<h2>Package-wide availability</h2>
				<CodeBlock source={packageScopeSource} language="ts" title="exact.config.ts" />
				<p>
					A package-scoped config export behaves like a virtual enhancement import in every compiled
					component owned by the package. Its provider can therefore check every component, while
					generated code imports the enhancement only in modules that use its namespace.
				</p>
				<p>
					The configuration loader records the declaration without executing runtime enhancement
					code. A local declaration with the same namespace is reported as a duplicate identifier.
				</p>
			</section>
			<section>
				<h2>Direct fragments and semantic targets</h2>
				<p>
					Enhancements on <code>_</code> occupy that fragment boundary directly, including text and
					multi-node output. Ordinary components may use <code>_target</code> to wrap their children
					while forwarding declarative properties and one semantic intrinsic target.
				</p>
				<CodeBlock source={targetSource} language="tsx" title="Field.tsx" />
				<p>
					Nested target layers compose classes, styles, token-list attributes, refs, events, and
					singular properties without mutating the authored child. Target routing follows only the
					active logical output path and stops at the first root-bearing component frame. DOM, SSR,
					and hydration share that bounded rule.
				</p>
			</section>
			<section>
				<h2>Build metadata, not plugin authority</h2>
				<p>
					The compiler reports the package identity supplied by the build, canonical component
					ownership, client/server placement and reachability, and canonical enhancement exports.
					Those data are the compiler&apos;s complete portable seam for catalog linking and later
					server component-library policy.
				</p>
				<p>
					The metadata never grants trust. A server bundler combines it with the physical package,
					alias, lockfile, and module graph that the bundler actually resolved. The compiler does
					not read a component-library marker or duplicate bundler authorization diagnostics.
				</p>
			</section>
			<section>
				<h2>Component libraries in this repository</h2>
				<div className="card-grid">
					<Link className="topic-card" to="/components/accessibility">
						<span className="topic-index">Native semantics + guidance</span>
						<strong>Accessibility</strong>
						<p>Connect refs, coordinate focus, and navigate complete custom composites.</p>
					</Link>
					<Link className="topic-card" to="/plugins/internationalization">
						<span className="topic-index">Language + build integration</span>
						<strong>Internationalization</strong>
						<p>
							Author messages and formatter intent as lightweight namespaced enhancements while the
							intl plugin coordinates extraction and catalogs.
						</p>
					</Link>
					<Link className="topic-card" to="/components/motion">
						<span className="topic-index">Visual behavior</span>
						<strong>Motion</strong>
						<p>Animate committed state with prepared definitions and task-owned playback.</p>
					</Link>
					<Link className="topic-card" to="/components/gestures">
						<span className="topic-index">Semantic input</span>
						<strong>Gestures</strong>
						<p>Recognize pointer and keyboard intent with bounded component-owned sessions.</p>
					</Link>
					<Link className="topic-card" to="/components/physics">
						<span className="topic-index">Deterministic simulation</span>
						<strong>Physics</strong>
						<p>Advance owned 2D worlds and optionally project body poses.</p>
					</Link>
					<Link className="topic-card" to="/components/gravity">
						<span className="topic-index">Force policy</span>
						<strong>Gravity</strong>
						<p>Compose finite acceleration fields through the physics force seam.</p>
					</Link>
				</div>
			</section>
		</Article>
	);
}
