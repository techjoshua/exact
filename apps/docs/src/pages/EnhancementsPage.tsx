import type { Component } from '@exactjs/core';
import { Link } from '@exactjs/router';
import { CodeBlock } from '../CodeBlock.jsx';
import { Article } from './Article.jsx';

const attributedSource = `import * as motion from '@exactjs/motion/enhancements'
  with { type: 'exact-enhancement' };

<ProductCard motion:fade motion:duration={180} />;`;

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
			next={{ path: '/components/motion', label: 'Motion' }}
		>
			<section>
				<h2>A namespaced component call</h2>
				<CodeBlock source={attributedSource} language="tsx" title="ProductCard.tsx" />
				<p>
					The attributed import is compile-only. Finite activators select ordinary components,
					shared props are sent to every selected component that declares them, and aliases of one
					canonical component still create one instance. The application bundle may include each
					identity in its enhancement catalog; missing entries leave the authored output unchanged.
				</p>
				<p>
					This catalog is not plugin discovery. A component library needs no plugin manifest,
					configuration controller, or host lifecycle merely to provide enhancements.
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
