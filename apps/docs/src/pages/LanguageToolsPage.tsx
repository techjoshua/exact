import type { Component } from '@exactjs/core';
import { Link } from '@exactjs/router';
import { CodeBlock } from '../CodeBlock.jsx';
import languageToolsIntlScreenshot from '../assets/language-tools-intl.png?inline';
import { Article } from './Article.jsx';
import { Callout } from './Callout.jsx';

const policyTaskSource = `export function ProductPage(
  this: Component<ProductState>,
  props: { productId: string }
) {
  const products = this.getContext(Products);

  async function loadProduct(
    productId: string,
    task: TaskContext = TaskContext.server().latest().blocking()
  ) {
    this.state.product = await products.find(productId, { signal: task.signal });
  }
  loadProduct(props.productId);

  return () => <ProductDetails product={this.state.product} />;
}`;

const settingsSource = `{
  "exact.languageTools.enabled": true,
  "exact.languageTools.codeLens": true,
  "exact.languageTools.inlayHints": "important",
  "exact.languageTools.regionDecorations": "boundaries",
  "exact.languageTools.semanticsView": true,
  "exact.languageTools.trace.server": "off"
}`;

const languageExtensionConfig = `import { defineConfig } from '@exactjs/config';

export default defineConfig({
  languageExtensions: {
    analyzers: {
      mode: 'trusted',
      allow: ['@company/design-system']
    },
    ignore: [
      { provider: '@company/design-system', roles: ['inlayHints'] }
    ]
  }
});`;

/** Documents compiler-owned editor feedback and task refactors. */
export function LanguageToolsPage(this: Component<{}>) {
	return () => (
		<Article
			eyebrow="Learn"
			title="See what the compiler sees"
			description="eXact Language Tools places compiler-owned information beside the source that produced it: task placement, dependencies, effects, ownership, reactive boundaries, and the reasons behind each inference."
			previous={{ path: '/learn/server-execution', label: 'Server execution' }}
			next={{ path: '/learn/devtools', label: 'Full-stack DevTools' }}
		>
			<section>
				<h2>Compiler meaning inside VS Code</h2>
				<p>
					CodeLens, operation badges, hovers, errors, warnings, and region decorations explain the
					compiler&apos;s conclusions without replacing TypeScript&apos;s ordinary editor behavior.
					An awaited state assignment can show its inferred placement and readiness; a task call can
					show its activation inputs; and a derived declaration can lead directly to every connected
					consumer.
				</p>
				<p>
					The Component Semantics view organizes those facts by authored ownership: initialization,
					tasks, derived values, and render boundaries. Selecting an entry reveals its source range,
					dependencies, captures, effects, supplied signal, resources, cleanup, and typed inference
					reasons. Broad and unknown paths remain visibly qualified.
				</p>
				<figure theme:surface="raised" className="editor-capture">
					<img
						src={languageToolsIntlScreenshot}
						alt="VS Code showing eXact internationalization enhancement attributes, message and unit inlay hints, and a hover listing Arabic, French, and Japanese translations."
						loading="lazy"
						decoding="async"
					/>
					<figcaption>
						The intl enhancement contributes inference hints and translation coverage through the
						same language-service contract used by eXact&apos;s core tooling.
					</figcaption>
				</figure>
			</section>
			<section>
				<h2>Author inferred policy—and reverse it safely</h2>
				<p>
					For a simple inferred task, the compiler can plan a named task function whose final
					<code>TaskContext</code> parameter spells out the normalized policy:
				</p>
				<CodeBlock source={policyTaskSource} language="tsx" title="Compiler-planned refactor" />
				<p>
					The plan preserves placement, readiness, priority, dependency order, cancellation, and
					state publication. It carries errors and warnings forward, then analyzes the proposed
					source in memory. The reverse refactor is offered only when the task has no authored
					resource ownership, cleanup, external effect, deliberate nonblocking policy, opaque signal
					use, or other semantic difference that inference could not reproduce.
				</p>
			</section>
			<section>
				<h2>Your files stay unchanged</h2>
				<p>
					Language Tools analyzes your latest edits, including unsaved changes. It never generates
					or overwrites source files. Your code changes only when you accept a suggested edit or
					refactor.
				</p>
			</section>
			<section>
				<h2>Works beside TypeScript</h2>
				<p>
					VS Code's TypeScript extension continues to provide completion, rename, navigation,
					formatting, and ordinary type errors and warnings. A narrow bundled TypeScript plugin
					gives local component functions the enclosing authored receiver for <code>this.</code>{' '}
					completion and removes the corresponding implicit-<code>this</code> false positive.
					Attributed enhancement imports count as used, and typing a prefix such as{' '}
					<code>motion:</code>
					completes the callable&apos;s finite public props in kebab-case plus the reserved
					<code>root</code> selector. Unrelated TypeScript errors and warnings remain unchanged.
				</p>
				<p>
					The separate eXact language server adds its own errors and warnings, semantic modifiers,
					hovers, operation badges, CodeLens, symbols, code actions, and the read-only Compiler
					Separation view. It filters ordinary TypeScript errors and warnings from compiler
					inspection so refactors do not leave a duplicate squiggle behind.
				</p>
				<p>
					Task errors and warnings describe local task functions, activation sites, and final
					<code>TaskContext</code> policy. The language server gives removed component registration
					APIs no special treatment or migration guidance.
				</p>
				<p>
					Badges sit at token boundaries: before an assignment or immediately after a call's opening
					parenthesis. <code>⚙</code> marks a specific one-time state initialization;
					<code>⚡</code> on an assignment marks a deferred reactive calculation. Task badges use
					<code>📋</code>, <code>🖥</code> or <code>📱</code> for placement, <code>⏳</code> for
					deferred priority, and <code>🚨</code> for immediate publication.
				</p>
				<p>
					eXact hover and region markers are limited to the selected operation or identifier. They
					do not cover the containing function body, so TypeScript can still show variable types and
					inner-call parameter information.
				</p>
				<p>
					The link badge follows a derived reactive assignment and precedes every compiler-resolved
					use. Function-defined tasks select only their authored name; an <code>await</code> inside
					the function remains a suspension point of that task rather than appearing as an embedded
					inferred task.
				</p>
				<p>
					Hover for a task with authored policy lists only the call arguments that activate it, once
					and in source order; values read inside its body remain captures or effects. Inferred
					tasks show compiler-discovered inputs using authored state paths and local destructured
					prop names, never a synthetic identifier absent from the source. A reactive parameter
					default appears separately as a captured input, making clear that it is sampled for a
					generation without scheduling one.
				</p>
				<p>
					Hovering a component JSX tag describes that referenced component rather than merely the
					containing component. For example, a client component rendered from a server page reports
					its client placement and boundary at the tag while retaining TypeScript's ordinary symbol
					hover alongside it.
				</p>
				<p>
					The language server installs negotiated listeners only after the LSP initialization
					handshake. Clients without workspace-folder change support continue as stable single-root
					sessions.
				</p>
				<p>
					In a monorepo, every document belongs to the nearest <code>exact.config.*</code> beneath
					its containing workspace folder. Nested applications therefore receive their own
					package-scoped enhancements and language providers even when the repository root is open
					in VS Code. The status tooltip shows that resolved project root and each provider&apos;s
					health; startup failures produce a visible warning and explanation.
				</p>
				<p>
					eXact semantic tokens preserve TypeScript's standard syntax classes: components and local
					task functions remain functions, while derived names remain variables. Keywords such as
					<code>return</code>, inferred <code>await</code> sites, JSX tags, and surrounding
					property-access syntax stay entirely under TypeScript and the active theme.
				</p>
				<CodeBlock source={settingsSource} language="json" title="VS Code settings" />
				<p>
					Presentation choices never change compiler semantics. In untrusted workspaces the
					extension does not execute workspace binaries, configuration modules, or plugins. Source,
					errors, warnings, and inspection facts remain local.
				</p>
			</section>
			<section>
				<h2>Package-owned assistance</h2>
				<p>
					<Link to="/components/enhancements">Enhancement libraries</Link> and framework plugins can
					report errors and warnings, offer completions and hovers, add hints, and suggest safe
					edits. Enable only providers you trust.
				</p>
				<CodeBlock source={languageExtensionConfig} language="ts" title="exact.config.ts" />
				<p>
					You can enable provider features by role, including error and warning reporting,
					completion, hover, hints, and code actions. Provider errors can stop an invalid build.
				</p>
				<p>
					The <code>@exactjs/intl</code> provider explains messages, shows translation coverage,
					checks catalogs and placeholders, and completes units, currencies, and display styles.
				</p>
				<p>
					The <code>@exactjs/accessibility</code> provider checks ARIA, labels, focus order,
					dialogs, keyboard behavior, and composite widgets. It also offers completions and safe
					fixes.
				</p>
			</section>
			<section>
				<h2>From source insight to runtime inspection</h2>
				<p>
					Language Tools explains the static program while you author it. The Chromium DevTools
					extension inspects the live side of the same model: durable component instances, state,
					tasks, reactive dependencies, client/server work, and microfrontend ownership.
				</p>
				<Link theme:action="secondary" className="secondary-link" to="/learn/devtools">
					Inspect a running eXact application
				</Link>
			</section>
			<Callout title="Tooling matches the build">
				<p>
					Language Tools uses the project&apos;s eXact compiler, so its feedback and refactors match
					the build.
				</p>
			</Callout>
		</Article>
	);
}
