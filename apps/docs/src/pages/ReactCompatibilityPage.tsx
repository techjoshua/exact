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

const asyncEventSource = `/** @jsxImportSource react */

export function SaveButton(props: { save(): Promise<void> }) {
  return <button onClick={() => props.save()}>Save</button>;
}`;

const refCleanupSource = `/** @jsxImportSource react */

export function MeasuredPanel() {
  return <section ref={(element) => {
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      console.log(entries[0]?.contentRect.width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }}>Panel</section>;
}`;

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
// Call it yourself when supplying a runtime-selected React component outside compiled JSX.
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
			description="Use supported React components and packages inside an eXact application."
			previous={{ path: '/react-developers', label: 'eXact for React developers' }}
			next={{ path: '/framework-comparison', label: 'Framework comparison' }}
		>
			<section>
				<h2>Render a React component</h2>
				<p>
					Adopting eXact does not have to mean replacing a React date picker or editor your team
					already relies on. The compatibility packages let you use supported React components
					inside an eXact application and connect them to its state.
				</p>
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
				<h2>Keep asynchronous event work with its component</h2>
				<p>
					When a React control saves data or starts navigation, return the promise from its
					callback. The compatibility renderer observes the work and sends failures to the owning
					error context. Effects also report their failures through the owning context. A released
					component does not receive late event failures or run queued effects.
				</p>
				<CodeBlock source={asyncEventSource} language="tsx" title="SaveButton.tsx" />
				<p>
					Unmounting releases sibling and descendant resources even if a ref callback throws. The
					first cleanup failure is preserved. A replacement remains owned and can be updated or
					unmounted afterward. Suspense also retains ownership of accepted transition content when
					earlier ref cleanup fails. Promise retries report through the owning error context and
					stop when their boundary is disposed. Effects and external-store subscriptions release
					every owned lease, including when another cleanup fails. Activity ranges retain their
					component state and DOM while hidden, then reconnect those resources when shown. Nested
					child arrays keep their groups and empty slots, so repeated local keys in separate groups
					do not merge component instances. Server rendering and hydration preserve adjoining text
					nodes across empty children and release their owned markup on unmount. Matching raw HTML
					is adopted in place, and portal updates retain their target content while respecting other
					owners in that target.
				</p>
			</section>

			<section>
				<h2>Release resources attached through refs</h2>
				<p>
					When a ref creates an observer or another element-owned resource, return its cleanup from
					the callback. The renderer retains one cleanup per attachment and calls it once when that
					attachment is released.
				</p>
				<CodeBlock source={refCleanupSource} language="tsx" title="MeasuredPanel.tsx" />
				<p>
					This also works for class refs and imperative handles. A callback shared by several
					attachments keeps independent cleanups. Callbacks that return no cleanup receive
					<code>null</code> on release, and object refs have their <code>current</code> cleared.
					When a ref throws during a new range attachment, the renderer releases resources acquired
					for that failed range.
				</p>
			</section>

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
					That selected boundary is self-contained: an imported package may produce host elements,
					Suspense, Activity, portals, or other React components without the native parent needing
					to classify its output. React&apos;s private interpreter is included only when a
					compatibility boundary is reachable.
				</p>
				<p>
					Use the <code>source</code> option only for React-owned source that your application
					authors or compiles itself. An explicit <code>@jsxImportSource react</code> directive can
					mark an individual source module with a leading block comment such as
					<code>/** @jsxImportSource react */</code>. To keep native eXact ownership explicit, use
					<code>/** @jsxImportSource @exactjs/jsx */</code>.
				</p>
			</section>

			<section>
				<h2>Nest React and eXact components</h2>
				<p>
					Statically known React descendants stay React-owned. Statically known eXact children are
					bridged when they cross a React boundary, preserving their long-lived eXact instances,
					context, DOM ownership, and cleanup. Shared values can use
					<code>defineInteropContext()</code> when both models need one logical context. The
					returned pair follows TypeScript's compile-time readonly rules. Existing consumers keep
					their token identities if a writable alias replaces a field in that pair.
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
					When a React-owned component needs no inputs, its render function can omit the props
					parameter. <code>memo()</code> and <code>forwardRef()</code> support that usage and retain
					declared prop types, keeping required inputs checked.
				</p>
				<p>
					For an existing TanStack Query client, <code>@exactjs/tanstack-query</code> exposes
					observer results as reactive source handles. Their readonly fields follow TypeScript's
					shallow, compile-time rules, while writable methods and mutable aliases keep ordinary
					JavaScript behavior. Disposing a source releases its observation. The application still
					owns the <code>QueryClient</code> and cache.
				</p>
				<p>
					For Jotai stores shared with native components, <code>ExactJotaiProvider</code> uses the
					supplied store or Jotai's default singleton, resolved when the adapter loads. Supply a
					request-owned store when server data must remain isolated between requests.
				</p>
				<p>
					SSR and hydration use the same ownership decision as the client build. Native eXact ranges
					retain eXact's selective hydration behavior. Compatible React trees use the supported
					React hydration contract. Browser-only React packages should remain inside an explicit
					client placement. Compatible server streams wait for asynchronous children before
					returning their completed output. Pass an AbortSignal in the server options to cancel
					pending work. The render rejects with the signal's exact reason, including null.
				</p>
				<p>
					Imported native components remain eXact-owned even when emitted JavaScript specifiers
					point back to TypeScript source files. Generated <code>.exact.client</code> and{' '}
					<code>.exact.server</code> imports are also always native artifacts. When no React-owned
					boundary is reachable, the compiler emits no compatibility adapter import, so React
					compatibility and its dependency graph are absent from the final client bundle.
				</p>
			</section>

			<section>
				<h2>Select a component at runtime</h2>
				<p>
					A component selected by a conditional, alias, or runtime registry uses the same generated
					boundary. The selected value is checked for the eXact brand. Otherwise the active React
					layer owns it. Use <code>adaptReactComponent()</code> or <code>ReactHost</code> explicitly
					only when constructing or hosting component values outside compiler-owned native JSX.
				</p>
				<CodeBlock source={explicitInteropSource} language="tsx" title="Explicit host APIs" />
			</section>

			<section>
				<h2>Supported React behavior</h2>
				<p>
					Compatibility lets you retain React components alongside native eXact components.
					Supported public behavior includes function and class components, Hooks, context, refs,
					portals, Suspense, scheduling, compatible roots, SSR, and hydration. Components that
					depend on private Fiber or host-renderer behavior are not yet compatible.
				</p>
			</section>
		</Article>
	);
}
