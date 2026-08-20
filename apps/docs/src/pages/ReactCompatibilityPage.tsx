import type { Component } from '@exactjs/core';
import { CodeBlock } from '../CodeBlock.jsx';
import { ReactCompatibilityDemo } from '../demos/ReactCompatibilityDemo.jsx';
import { Article } from './Article.jsx';

const reactCompatibilitySource = `import { exact } from '@exactjs/vite-plugin';

export default {
  plugins: [
    exact({
      reactCompatibility: {
        target: 19,
        // Only authored React source needs a source rule.
        source: [/src\\/legacy-react/]
      }
    })
  ]
};`;

const directComponentSource = `import type { Component } from '@exactjs/core';
import { DatePicker } from 'react-date-picker';

function BookingForm(this: Component<{ date: Date | null }>) {
  this.state.date = null;

  return () => (
    <section>
      {/* Imported component values use the active compatibility layer. */}
      <DatePicker
        value={this.state.date}
        onChange={(date) => (this.state.date = date)}
      />

      {/* This remains a precise native eXact expression. */}
      <p>Selected: {this.state.date?.toLocaleDateString() ?? 'none'}</p>
    </section>
  );
}`;

const explicitInteropSource = `import { ReactHost, adaptReactComponent } from '@exactjs/react-compat/exact';

// Native compiled JSX normally inserts this adapter automatically.
// Call it yourself when constructing a VNode outside that path.
const CompatibleWidget = adaptReactComponent(runtimeSelectedWidget);

return () => (
  <>
    <CompatibleWidget value={this.state.value} />
    <ReactHost component={runtimeSelectedPanel} componentProps={{ value: this.state.value }} />
  </>
);`;

/** Documents direct, compiler-owned use of supported React components in eXact applications. */
export function ReactCompatibilityPage(this: Component<{}>) {
	return () => (
		<Article
			eyebrow="Build for the web"
			title="Bring React with you"
			description="Supported React 18 and 19 components can appear directly in native eXact JSX. The compiler inserts the compatibility boundary while eXact state and precise reactive updates remain in control."
			previous={{ path: '/guides/testing', label: 'Testing' }}
			next={{ path: '/plugins', label: 'Plugin system' }}
		>
			<section>
				<h2>The ordinary case is direct JSX</h2>
				<p>
					Import a React component and render it where you need it. A reactive eXact prop causes
					that React component to receive the new value, and its callbacks can mutate the owning
					eXact component's inspectable state directly.
				</p>
				<CodeBlock source={directComponentSource} language="tsx" title="BookingForm.tsx" />
				<p>
					The React component retains React behavior internally: Hooks, class state, effects,
					context, refs, Suspense, and cleanup still follow their React contracts. The surrounding
					eXact component does not become a React component and does not start rerendering as one.
				</p>
			</section>

			<ReactCompatibilityDemo />

			<section>
				<h2>Choose the React target once</h2>
				<CodeBlock source={reactCompatibilitySource} language="ts" title="vite.config.ts" />
				<p>
					The target can be React 18 or 19, or it can be detected from an installed React package.
					The same option is available in the Webpack and Bun integrations. Reference
					<code>@exactjs/react-compat/types18</code> or
					<code>@exactjs/react-compat/types19</code> in <code>compilerOptions.types</code> so the
					editor and compiler accept the matching React component types in native eXact JSX.
				</p>
			</section>

			<section>
				<h2>Use published React packages directly</h2>
				<p>
					Install and import supported packages from <code>node_modules</code>. The build
					integration routes React, React DOM, and JSX through the selected compatibility runtime.
				</p>
				<p>
					Use the <code>source</code> option only for React-owned source that your application
					authors or compiles itself. An explicit <code>@jsxImportSource react</code> directive can
					mark an individual source module; <code>@jsxImportSource @exactjs/jsx</code> keeps native
					eXact ownership explicit.
				</p>
			</section>

			<section>
				<h2>Mixed trees keep their owners</h2>
				<p>
					Statically known React descendants stay React-owned. Statically known eXact children are
					bridged when they cross a React boundary, preserving their long-lived eXact instances,
					context, DOM ownership, and cleanup. Shared values can use
					<code>defineInteropContext()</code> when both models need one logical context.
				</p>
				<p>
					The matching <code>types18</code> or <code>types19</code> facade also lets React-owned
					source render a compiled eXact component directly. The compatible React element pipeline
					checks its compiler-emitted brand before mounting it natively. The live stepper above
					includes an eXact-owned child through exactly that path.
					<code>exposeExactComponent()</code>
					remains useful for stock React builds outside eXact compatibility and explicit
					ref-property bridges.
				</p>
				<p>
					SSR and hydration use the same ownership decision as the client build. Native eXact ranges
					retain eXact's selective hydration behavior; compatible React trees use the supported
					React hydration contract. Browser-only React packages should remain inside an explicit
					client placement.
				</p>
				<p>
					Imported native components remain eXact-owned even when emitted JavaScript specifiers
					point back to TypeScript source files. When no React-owned boundary is reachable, the
					compiler emits no compatibility adapter import, so React compatibility and its dependency
					graph are absent from the final client bundle.
				</p>
			</section>

			<section>
				<h2>Runtime-selected components work too</h2>
				<p>
					A component selected by a conditional, alias, or runtime registry uses the same generated
					boundary. The selected value is checked for the eXact brand; otherwise the active React
					layer owns it. Use <code>adaptReactComponent()</code> or <code>ReactHost</code> explicitly
					only when constructing or hosting component values outside compiler-owned native JSX.
				</p>
				<CodeBlock source={explicitInteropSource} language="tsx" title="Explicit host APIs" />
			</section>

			<section>
				<h2>Compatibility boundary</h2>
				<p>
					Use compatibility for existing React components. Build new native components with eXact
					APIs. Supported public behavior includes function and class components, Hooks, context,
					refs, portals, Suspense, scheduling, compatible roots, SSR, and hydration. While most
					React compnents will work fine, components that depend on private Fiber or host-renderer
					behavior are not yet compatible.
				</p>
			</section>
		</Article>
	);
}
