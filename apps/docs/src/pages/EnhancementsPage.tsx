import type { Component } from '@exactjs/core';
import { Link } from '@exactjs/router';
import { CodeBlock } from '../CodeBlock.jsx';
import { Article } from './Article.jsx';

const attributedSource = `import * as motion from '@exactjs/motion/enhancements'
  with { type: 'exact-enhancement' };

<ProductCard motion:fade motion:duration={180} />;`;

const fieldSource = `function Field(props: FieldProps) {
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

const fieldExportSource = `export { Field as field } from './Field.js'
  with { type: 'exact-enhancement' };`;

const fieldUsageSource = `import * as form from '@acme/forms/enhancements'
  with { type: 'exact-enhancement' };

<input
  name="email"
  form:field
  form:label="Email"
  form:description="We'll only use this to contact you."
  form:description-id="email-description"
/>`;

const packageScopeSource = `export * as intl from '@exactjs/intl/enhancements' with {
  type: 'exact-enhancement',
  scope: 'package'
};

export default defineConfig({});`;

/** Explains optional ordinary-component enhancement composition. */
export function EnhancementsPage(this: Component<{}>) {
	return () => (
		<Article
			eyebrow="Component language"
			title="Extend JSX. Enrich the experience."
			description="An enhancement is an optional component around authored output. Namespaced JSX selects it, and the consuming application decides whether its provider participates."
			previous={{ path: '/guides/react-compatibility', label: 'React compatibility' }}
			next={{ path: '/components/theme', label: 'Theme proposal' }}
		>
			<section>
				<h2>An optional component around authored output</h2>
				<p>
					An enhancement is an ordinary eXact component selected through a finite namespaced JSX
					attribute. It can wrap or observe the authored output, contribute properties and behavior,
					and retain normal component ownership and inspection. If its provider is unavailable or
					disabled, the authored output remains as the pass-through result.
				</p>
				<CodeBlock source={attributedSource} language="tsx" title="ProductCard.tsx" />
				<p>
					The attributed import is compile-only. Activators such as <code>motion:fade</code> select
					a finite component, while shared namespaced props are passed to selected components that
					declare them. Aliases of one canonical component still create one instance.
				</p>
			</section>

			<section>
				<h2>Define, publish, and use an enhancement</h2>
				<p>
					This <code>Field</code> is the enhancement component itself. It wraps the authored control
					with its label and description. <code>_target</code> routes
					<code>aria-describedby</code> to the input rather than leaving it on the label.
				</p>
				<CodeBlock source={fieldSource} language="tsx" title="Field.tsx" />
				<p>A finite attributed export publishes that ordinary component as an enhancement:</p>
				<CodeBlock source={fieldExportSource} language="ts" title="enhancements.ts" />
				<p>
					The consumer imports the namespace and applies the component through props on the element
					being enhanced:
				</p>
				<CodeBlock source={fieldUsageSource} language="tsx" title="SignupForm.tsx" />
				<p>
					Conceptually, this composes the input as a child of <code>Field</code>. The enhancement
					remains a durable, inspectable component without requiring wrapper markup at every call
					site.
				</p>
			</section>

			<section>
				<h2>Libraries author the option; applications decide</h2>
				<p>
					A component library may author enhancement attributes, but it does not force the consuming
					application to activate those enhancements. The application controls the providers used by
					its build. When enabled, the selected enhancement behaves as a normal component. When
					absent or disabled, the authored output passes through with no enhancement instance or
					provider runtime on that path.
				</p>
				<p>
					The generated provider facade loads the enhancement renderer with the component that needs
					it. Static components include it in their normal graph; lazy components and microfrontends
					carry it in their later-loaded graph and can activate it after the host root exists. An
					application with no selected enhancements does not ship the enhancement mounting, routing,
					or reconciliation implementation.
				</p>
			</section>

			<section>
				<h2>Fragments, shared props, and package-wide providers</h2>
				<p>
					Enhancements on <code>_</code> occupy that transparent fragment boundary directly,
					including text and multi-node output. Nested <code>_target</code> layers compose classes,
					styles, token-list attributes, refs, events, and singular properties without mutating the
					authored child. Compiler-owned native-control bindings remain attached verbatim when a
					layer styles or augments a bound input or select. Target routing follows the active
					logical output path and stops at the first root-bearing component frame.
				</p>
				<p>
					During client DOM mounting, a direct intrinsic or <code>_</code> chain that declares a
					provided context constructs before that target&apos;s descendants. It can consequently
					establish services, themes, or policies that descendant components consume during setup,
					with nested enhanced targets constructing inside the outer provider chain.
				</p>
				<CodeBlock source={packageScopeSource} language="ts" title="exact.config.ts" />
				<p>
					A package-scoped export behaves like a virtual enhancement import in every component owned
					by that package, while generated code imports it only where the namespace is used. A
					finite prop may also be marked <code>@exact analyzer-only</code> when it supplies typed
					evidence to trusted tooling but should not become runtime component input.
				</p>
			</section>

			<section>
				<h2>Enhancements are an open package contract</h2>
				<p>
					eXact&apos;s motion, gestures, accessibility, internationalization, physics, and gravity
					libraries are examples, not an allowlist. Anyone can publish enhancements by exporting
					ordinary components through the finite <code>exact-enhancement</code> contract. No plugin,
					central registration, special base class, or private compiler API is required.
				</p>
				<p>
					Enhancement packages can also participate in the language-server process with bounded
					completions, hovers, hints, diagnostics, and safe edits. The intl package explains
					inferred messages and warns about invalid placeholders or missing catalogs. The
					accessibility package provides ARIA guidance and warns about invalid names, relationships,
					focus, and composite structures. Third-party packages can provide the same combination of
					runtime composition and authoring guidance without teaching those rules to the core
					compiler.
				</p>
				<Link className="secondary-link" to="/learn/language-tools">
					See package-owned editor assistance
				</Link>
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
						<p>Author semantic messages while build tooling coordinates extraction and catalogs.</p>
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
