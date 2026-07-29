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

const explicitTaskSource = `export function ProductPage(
  this: Component<ProductState>,
  props: { productId: string }
) {
  const products = this.getContext(Products);

  this.task.server.blocking(
    props.productId,
    async (productId, { signal }) => {
      this.state.product = await products.find(productId, { signal });
    }
  );

  return () => <ProductDetails product={this.state.product} />;
}`;

const serviceSource = `import { createExactLanguageService } from '@exactjs/compiler';

const language = createExactLanguageService({
  root: process.cwd(),
  noEmit: true
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
			previous={{ path: '/learn/compiler-tour', label: 'Inside the compiler' }}
			next={{ path: '/learn/devtools', label: 'Full-stack DevTools' }}
		>
			<section>
				<h2>Compiler meaning at the source</h2>
				<p>
					The outer component function is setup-once initialization. The returned function is
					reactive render work. Awaited state production becomes an inferred task, while{' '}
					<code>this.task()</code> registers explicit owned work. The language server presents those
					as compiler regions instead of asking you to inspect generated JavaScript.
				</p>
				<CodeBlock source={inferredTaskSource} language="tsx" title="ProductPage.tsx" />
				<p>
					Above the awaited assignment, CodeLens can summarize{' '}
					<code>Inferred blocking server task · props.productId → state.product</code>. Hover adds
					the native compiler reasons: the repository context selects server placement, the initial
					view consumes <code>state.product</code>, and the task generation owns cancellation and
					staged publication.
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
					Selecting a fact reveals its authored range, dependencies, effects, supplied signal,
					resources, cleanup, and typed inference reasons. Broad and unknown paths stay visibly
					qualified; the editor never invents false precision.
				</p>
			</section>
			<section>
				<h2>Make inference explicit—and reverse it safely</h2>
				<p>For a simple inferred task, the compiler can plan this explicit form:</p>
				<CodeBlock source={explicitTaskSource} language="tsx" title="Compiler-planned refactor" />
				<p>
					The plan preserves placement, readiness, priority, dependency order, cancellation, state
					publication, and diagnostics, then analyzes the proposed source in memory. The reverse
					refactor is offered only when the explicit task has no resource, cleanup, external effect,
					deliberate nonblocking policy, opaque signal use, or other semantic difference that
					inference could not reproduce.
				</p>
			</section>
			<section>
				<h2>The language service is no-emit</h2>
				<CodeBlock source={serviceSource} language="ts" title="Compiler API" />
				<p>
					Unsaved text overlays disk files without writing them. Every synchronization receives an
					immutable generation; rapid edits cancel or supersede older work, and stale diagnostics or
					refactor edits are never published. Closing a workspace disposes its overlays, dependency
					indexes, pending requests, and native compiler process.
				</p>
			</section>
			<section>
				<h2>Works beside TypeScript</h2>
				<p>
					VS Code's TypeScript extension continues to provide completion, rename, navigation,
					formatting, and ordinary type diagnostics. The separate eXact language server adds only
					framework-owned diagnostics, semantic modifiers, hovers, inlay hints, CodeLens, symbols,
					code actions, and the read-only Compiler Separation view.
				</p>
				<p>
					The language server installs negotiated listeners only after the LSP initialization
					handshake. Clients without workspace-folder change support continue as stable single-root
					sessions.
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
					language="sh"
					title="Extension Development Host"
				/>
				<p>
					The launcher builds the language server and VS Code client, prefers that freshly built
					sibling over any installed dependency copy, and opens a fresh development host. Use{' '}
					<code>--skip-build</code> when reusing current output or <code>--dry-run</code> to inspect
					the launch plan. Trust the opened workspace and open a TypeScript or TSX file to activate
					eXact Language Tools.
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
