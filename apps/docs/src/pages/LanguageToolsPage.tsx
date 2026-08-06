import type { Component } from '@exactjs/core';
import { CodeBlock } from '../CodeBlock.jsx';
import { Article } from './Article.jsx';
import { Callout } from './Callout.jsx';

const inferredTaskSource = `export async function ProductPage(
  this: Component<ProductState>,
  props: { productId: string }
) {
  const products = this.getContext(Products);

  this.state.product = await products.find(props.productId);

  const displayPrice = this.reactive(() =>
    this.state.product ? formatPrice(this.state.product.price) : ''
  );

  return () => (
    <main>
      <h1>{this.state.product?.name ?? 'Product'}</h1>
      <p>{displayPrice}</p>
    </main>
  );
}`;

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

const serviceSource = `import { createExactLanguageService } from '@exactjs/compiler';

const language = createExactLanguageService({
  root: process.cwd(),
  noEmit: true,
  maxCachedAnalyses: 128,
  maxCachedAnalysisBytes: 32 * 1024 * 1024
});

await language.synchronize([{
  kind: 'upsert',
  filename: 'src/ProductPage.tsx',
  version: 4,
  source: unsavedEditorText
}]);

const inspection = await language.inspect('src/ProductPage.tsx');
await language.dispose();`;

const settingsSource = `{
  "exact.languageTools.enabled": true,
  "exact.languageTools.codeLens": true,
  "exact.languageTools.inlayHints": "important",
  "exact.languageTools.regionDecorations": "boundaries",
  "exact.languageTools.semanticsView": true,
  "exact.languageTools.trace.server": "off"
}`;

const extensionLauncherSource = `npm run dev:vscode-extension

# VS Code Insiders or a focused sample workspace
npm run dev:vscode-extension -- --code code-insiders --workspace apps/kanban`;

/** Documents compiler-owned editor semantics, diagnostics, and task refactors. */
export function LanguageToolsPage(this: Component<{}>) {
	return () => (
		<Article
			eyebrow="Learn"
			title="See what the compiler sees"
			description="eXact Language Tools explains setup, render work, tasks, placement, dependencies, effects, and ownership while you edit—using the same native analysis that builds the application."
			previous={{ path: '/learn/server-execution', label: 'Server execution' }}
			next={{ path: '/learn/devtools', label: 'Full-stack DevTools' }}
		>
			<section>
				<h2>Compiler meaning at the source</h2>
				<p>
					The outer component function is setup-once initialization. The returned function is
					reactive render work. Awaited state production becomes an inferred task. An ordinary local
					function with a final <code>TaskContext</code> parameter is the same task model with
					authored policy and access to its generation context. The language server presents both as
					compiler regions instead of asking you to inspect generated JavaScript.
				</p>
				<CodeBlock source={inferredTaskSource} language="tsx" title="ProductPage.tsx" />
				<p>
					A compact component CodeLens reports <code>eXact · 1 task</code>. The badge beside the
					awaited assignment carries the detailed task facts; hover adds the native compiler
					reasons: the repository context selects server placement, the initial view consumes{' '}
					<code>state.product</code>, and the task generation owns cancellation and staged
					publication.
				</p>
			</section>
			<section>
				<h2>A component-shaped outline</h2>
				<p>The Component Semantics view organizes facts around authored ownership:</p>
				<pre>
					<code>{`ProductPage
├─ Initialization
├─ Tasks
│  └─ Product lookup — inferred, server, blocking
├─ Derived values
│  └─ displayPrice — state.product.price
└─ Render
   ├─ heading text — state.product.name
   └─ price text — displayPrice`}</code>
				</pre>
				<p>
					Selecting a fact reveals its authored range, dependencies, captured parameter inputs,
					effects, supplied signal, resources, cleanup, and typed inference reasons. Broad and
					unknown paths stay visibly qualified; the editor never invents false precision.
				</p>
			</section>
			<section>
				<h2>Author inferred policy—and reverse it safely</h2>
				<p>
					For a simple inferred task, the compiler can plan a named task function whose final{' '}
					<code>TaskContext</code> parameter spells out the normalized policy:
				</p>
				<CodeBlock source={policyTaskSource} language="tsx" title="Compiler-planned refactor" />
				<p>
					The plan preserves placement, readiness, priority, dependency order, cancellation, state
					publication, and diagnostics, then analyzes the proposed source in memory. The reverse
					refactor is offered only when the task has no authored resource ownership, cleanup,
					external effect, deliberate nonblocking policy, opaque signal use, or other semantic
					difference that inference could not reproduce.
				</p>
			</section>
			<section>
				<h2>The language service is no-emit</h2>
				<CodeBlock source={serviceSource} language="ts" title="Compiler API" />
				<p>
					Unsaved text overlays disk files without writing them. Every synchronization receives an
					immutable generation; rapid edits cancel or supersede older work, and stale diagnostics or
					refactor edits are never published. The server also captures the document version and text
					before awaiting analysis, then rejects the result if another edit has arrived. Closing a
					workspace disposes its overlays, dependency indexes, pending requests, and native compiler
					process.
				</p>
				<p>
					Cold disk analyses use an access-ordered cache bounded by count and estimated bytes. Open
					overlays are pinned even when they exceed that budget, and <code>language.stats()</code>{' '}
					reports snapshot, analysis, import-graph, eviction, and over-budget telemetry. Cold source
					is reread from disk instead of being retained only as a snapshot.
				</p>
			</section>
			<section>
				<h2>Works beside TypeScript</h2>
				<p>
					VS Code's TypeScript extension continues to provide completion, rename, navigation,
					formatting, and ordinary type diagnostics. A narrow bundled TypeScript plugin gives local
					component functions the enclosing authored receiver for <code>this.</code> completion and
					removes the corresponding implicit-<code>this</code> false positive. Attributed
					enhancement imports count as used, and typing a prefix such as <code>motion:</code>{' '}
					completes the callable&apos;s finite public props in kebab-case plus the reserved{' '}
					<code>root</code> selector. Unrelated TypeScript diagnostics remain unchanged.
				</p>
				<p>
					The separate eXact language server adds framework-owned diagnostics, semantic modifiers,
					hovers, operation badges, CodeLens, symbols, code actions, and the read-only Compiler
					Separation view. It filters ordinary TypeScript diagnostics from compiler inspection so
					refactors do not leave a duplicate squiggle behind.
				</p>
				<p>
					Task diagnostics describe local task functions, activation sites, and final{' '}
					<code>TaskContext</code> policy. Removed component registration APIs receive no special
					parsing, classification, diagnostics, or migration behavior.
				</p>
				<p>
					Badges sit at token boundaries: before an assignment or immediately after a call's opening
					parenthesis. <code>⚙</code> marks a specific one-time state initialization;{' '}
					<code>⚡</code> on an assignment marks a deferred reactive calculation. Task badges use{' '}
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
					eXact semantic tokens preserve TypeScript's standard syntax classes: components and local
					task functions remain functions, while derived names remain variables. Keywords such as{' '}
					<code>return</code>, inferred <code>await</code> sites, JSX tags, and surrounding
					property-access syntax stay entirely under TypeScript and the active theme.
				</p>
				<CodeBlock source={settingsSource} language="json" title="VS Code settings" />
				<p>
					Presentation choices never change compiler semantics. In untrusted workspaces the
					extension does not execute workspace binaries, configuration modules, or plugins. Source,
					diagnostics, and inspection facts remain local.
				</p>
			</section>
			<section>
				<h2>Run the extension from a checkout</h2>
				<CodeBlock
					source={extensionLauncherSource}
					language="shell"
					title="Extension Development Host"
				/>
				<p>
					The launcher builds the language server and bundles the VS Code client beneath its
					registered extension path, leaving only VS Code&apos;s host API external. It prefers the
					freshly built sibling server over any installed dependency copy and opens a fresh
					development host. Use <code>--skip-build</code> when reusing current output or{' '}
					<code>--dry-run</code> to inspect the launch plan. Trust the opened workspace and open a
					TypeScript or TSX file to activate eXact Language Tools.
				</p>
			</section>
			<Callout title="One compiler authority">
				<p>
					The extension and language server contain no second eXact classifier. The pinned native
					compiler owns placement, scheduling, effects, diagnostics, and refactors, so the
					explanation you read is the behavior that will build.
				</p>
			</Callout>
		</Article>
	);
}
