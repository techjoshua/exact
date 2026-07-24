import type { Component } from '@exactjs/core';
import { CodeBlock } from '../CodeBlock.jsx';
import { Article } from './Article.jsx';

const reactCompatibilitySource = `import { exact } from '@exactjs/vite-plugin';

export default {
  plugins: [
    exact({
      reactCompatibility: {
        target: 19,
        // Only this source is interpreted as React-owned JSX.
        source: [/node_modules\\/react-package/, /src\\/legacy-react/]
      }
    })
  ]
};`;

const reactInteropSource = `import { defineInteropContext, exposeExactComponent } from '@exactjs/react-compat/interop';

// One token can be read from native eXact and compatible React components.
export const Session = defineInteropContext('session', anonymousSession);

function AccountBadge(this: Component<{}>) {
  const session = this.getContext(Session.exact);
  return () => <strong>{session.userName}</strong>;
}

// Make a native component explicit at a React-owned JSX boundary.
export const ReactAccountBadge = exposeExactComponent(AccountBadge);`;

export function ReactCompatibilityPage(this: Component<{}>) {
	return () => (
		<Article
			eyebrow="Build for the web"
			title="Adopt eXact without leaving supported React code behind"
			description="eXact includes compatibility runtimes for supported React 18 and 19 code, build-time JSX ownership, DOM and server entry aliases, and explicit boundaries between native eXact and React-shaped components."
			previous={{ path: '/guides/testing', label: 'Testing' }}
			next={{ path: '/plugins', label: 'Plugin system' }}
		>
			<section>
				<h2>Why compatibility belongs in the framework</h2>
				<p>
					A new framework is easier to evaluate when existing packages and migration work do not
					become an all-or-nothing rewrite. Compatibility mode lets a build recognize selected
					React-owned modules, rewrite their runtime imports, and render them through eXact's
					compatibility layer while native eXact components keep their own model.
				</p>
				<p>
					This is an adoption bridge, not a claim that every package in the React ecosystem is
					automatically supported. Packages can depend on undocumented reconciler behavior or host
					assumptions; adapter discovery and validation exist for those cases.
				</p>
			</section>
			<section>
				<h2>Select React-owned source deliberately</h2>
				<CodeBlock source={reactCompatibilitySource} language="ts" title="vite.config.ts" />
				<p>
					The target may be React 18 or 19, or can be detected from an installed React package.
					Explicit
					<code>@jsxImportSource react</code> and <code>@jsxImportSource @exactjs/jsx</code>{' '}
					directives take precedence over source filters, which keeps ownership visible in mixed
					projects.
				</p>
			</section>
			<section>
				<h2>Interop is explicit where models meet</h2>
				<CodeBlock source={reactInteropSource} language="tsx" title="interop.tsx" />
				<p>
					Compatibility includes shared context tokens, a native component boundary for React-owned
					JSX, and a<code>ReactHost</code> component for hosting React component types from eXact.
					Explicit boundaries preserve tree shaking and make it clear which semantics apply on each
					side.
				</p>
			</section>
			<section>
				<h2>What is implemented today</h2>
				<div className="definition-grid">
					<code>Build aliases</code>
					<p>React, JSX runtime, React DOM client, server, and React 19 static entrypoints.</p>
					<code>React majors</code>
					<p>Separate compatibility targets for React 18 and React 19.</p>
					<code>Core runtime</code>
					<p>
						React-shaped elements, function and class support, hooks, context, refs, suspense, and
						compatible roots.
					</p>
					<code>Package adapters</code>
					<p>Discovery and version validation for packages needing targeted compatibility rules.</p>
					<code>Interop</code>
					<p>Shared contexts, native component exposure, React hosting, and node conversion.</p>
					<code>Guardrails</code>
					<p>
						Strict JSX ownership and reconciler-major validation fail early when a build is
						ambiguous.
					</p>
				</div>
			</section>
		</Article>
	);
}
