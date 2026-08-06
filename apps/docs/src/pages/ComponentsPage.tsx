import type { Component } from '@exactjs/core';
import { Link } from '@exactjs/router';
import { CodeBlock } from '../CodeBlock.jsx';
import { Article } from './Article.jsx';
import { Callout } from './Callout.jsx';

const componentSource = `type CardState = { open: boolean };
type CardProps = { name: string; children?: Child };

function ProfileCard(this: Component<CardState>, props: CardProps) {
  // Setup: this code runs once for each mounted ProfileCard instance.
  this.state.open = false;
  this.onMount(() => this.log.info('Profile mounted'));

  // View: the returned function keeps reactive expressions connected.
  return () => (
    <article className="profile-card" className:is-open={this.state.open}>
      <button onClick={() => this.state.open = !this.state.open}>
        {props.name}
      </button>
      {this.state.open ? props.children : null}
    </article>
  );
}`;

const microComponentSource = `function Article(this: Component<ArticleState>) {
  const Footer = (props: { prefix?: string } = {}) => (
    <footer>{props.prefix}{this.state.copyrightText}</footer>
  );
  const Page = () => <article><ArticleBody /><Footer /></article>;

  return () => <Page />;
}`;

const contextSource = `const ThemeContext = createContext<Theme>('theme');

function ThemeProvider(this: Component<{}>, props: { children?: Child }) {
  // Publish a value for descendants of this component.
  this.setContext(ThemeContext, { accent: 'teal', density: 'comfortable' });
  return () => props.children;
}

function Toolbar(this: Component<{}>) {
  // Lookup walks parent components, then framework defaults.
  const theme = this.getContext(ThemeContext);
  return () => <nav style={{ color: theme.accent }}>...</nav>;
}`;

const componentTaskSource = `function Presence(this: Component<{ userId: string; status: string }>, props: { userId: string }) {
  this.state.status = 'connecting';

  async function observePresence(userId: string) {
    // The compiler infers props.userId and captures it for this generation.
    const response = await fetch('/api/presence/' + userId);
    this.state.status = (await response.json()).status;
  }
  observePresence(props.userId);

  return () => <span>{this.state.status}</span>;
}`;

const componentValueSource = `function Results(this: Component<{ layout: 'grid' | 'list' }>) {
  // Immutable aliases and finite choices remain ordinary component values.
  const View = this.state.layout === 'grid' ? ResultGrid : ResultList;
  return () => <View />;
}`;

/** Explains setup-once components, component values, context, and owned task behavior. */
export function ComponentsPage(this: Component<{}>) {
	return () => (
		<Article
			eyebrow="Learn"
			title="Components are long-lived instances"
			description="A component function is setup, not a rerender loop. It initializes state and services once, then returns the view that stays connected to them."
			previous={{ path: '/runtimes', label: 'Runtimes & integrations' }}
			next={{ path: '/learn/state', label: 'State & derived values' }}
		>
			<section>
				<h2>Read a component in two passes</h2>
				<p>
					First read the outer function as construction. eXact supplies a component instance as
					<code>this</code> and reactive props as the second argument. Then read the returned
					function as the view: expressions inside it stay attached to the DOM boundaries created by
					the compiler.
				</p>
				<CodeBlock source={componentSource} language="tsx" title="ProfileCard.tsx" />
				<p>
					Each mounted <code>ProfileCard</code> gets its own state, task scope, context boundary,
					refs, and lifecycle. Props remain parent-owned input. An event can assign state directly
					because the compiler has already connected consumers of that field.
				</p>
				<p>
					That ownership stays inspectable without making every instance carry duplicate method
					closures and unused collections. Stable component and logging methods are shared, while
					refs, list caches, contexts, lifecycle storage, task collections, and cancellation are
					created when the component uses them. Call methods through <code>this</code>; an extracted
					unbound component method does not retain its receiver.
				</p>
				<p>
					Readonly prop tracking traverses plain objects and collections. Opaque class instances
					retain their authored identity when passed through reactive JSX, so resource methods can
					mutate their own private state without being treated as writes to the prop binding.
				</p>
				<p>
					The compiler also stores an opaque stable ID under{' '}
					<code>Symbol.for('@exactjs/component')</code>. Native renderers use that brand instead of
					guessing from a function name or shape; unbranded React, Preact, and other foreign
					components stay owned by their explicit compatibility layer.
				</p>
				<p>
					The returned function is synchronous and contains one view expression. Put declarations
					and control flow in setup; compiled reactive regions update independently instead of
					rerunning arbitrary view code. State writes, task or lifecycle registration, scheduling,
					and known DOM or storage effects belong in setup, a task, or an interaction callback.
				</p>
				<p>
					For a static conditional token on an intrinsic element, <code>className:name</code>{' '}
					appends the token when its value is truthy. Contributions keep prop order and become one
					DOM <code>class</code> value; arrays and maps remain useful when the token name itself is
					dynamic.
				</p>
				<CodeBlock source={microComponentSource} language="tsx" title="Lexical micro-components" />
				<p>
					A setup-local, PascalCase view arrow is a micro-component. It captures the owning
					component&apos;s <code>this</code>, may compose other micro-components in scope, and
					receives no separate component identity, state, lifecycle, or task scope. Module-level
					shared or bound render callables are not component views.
				</p>
			</section>
			<section>
				<h2>Components can provide services to descendants</h2>
				<p>
					Context is explicit and scoped to the component tree. A provider calls
					<code>this.setContext()</code>; descendants call <code>this.getContext()</code> with the
					same typed token. Reactive context values remain reactive, while tokens configured with
					<code>reactive: false</code> preserve opaque service identity. When a provider is
					optional, check <code>this.hasContext(token)</code> before calling
					<code>this.getContext(token)</code>; this avoids hiding real lookup failures in a broad
					<code>try/catch</code>.
				</p>
				<CodeBlock source={contextSource} language="tsx" title="ThemeContext.tsx" />
			</section>
			<section>
				<h2>Component values remain ordinary TypeScript</h2>
				<p>
					An immutable local function, an alias to a known component, or a finite conditional choice
					can be used as a JSX tag. A reactive choice is mounted through a slot, so changing the
					selected component replaces only that subtree. Keep the choice as a setup-derived value;
					the compiler observes its dependencies while the returned view stays one expression. When
					the choice comes from a reusable named collection, declare its complete key set with{' '}
					<code>createComponentRegistry()</code>. Open-ended object lookup remains a compiler error
					because the compiler cannot determine its complete client/server placement graph.{' '}
					<Link to="/learn/component-registries">Read the component registry guide.</Link>
				</p>
				<CodeBlock source={componentValueSource} language="tsx" title="Results.tsx" />
			</section>
			<section>
				<h2>Tasks make work part of the component</h2>
				<p>
					A task is not an after-render callback. It is a setup declaration for work owned by this
					instance. State, prop, and reactive context reads are inferred as dependencies; when one
					changes, eXact aborts the old generation and starts the next.
				</p>
				<CodeBlock source={componentTaskSource} language="tsx" title="Presence.tsx" />
				<p>
					The compiler also analyzes environment usage. Browser globals imply client placement,
					server-only imports imply server placement, and state-writing work with neither can be
					isomorphic. If an opaque call makes placement unknowable, or intent matters more than
					inference, add a final <code>TaskContext</code> parameter with{' '}
					<code>TaskContext.client()</code> or <code>TaskContext.server()</code>. Contradictory
					placement is a compile error rather than a runtime surprise.
				</p>
				<Link className="secondary-link" to="/learn/tasks">
					Follow task inference and cleanup
				</Link>
			</section>
			<section>
				<h2>The instance surface, after the model</h2>
				<p>
					Calling <code>this.ref(key)</code> returns the same component-owned binding for that key.
					Its reactive <code>current</code> value is also available through{' '}
					<code>this.refs.get(key)</code>, so tasks and derived work can observe fulfillment and
					removal without polling.
				</p>
				<p>
					<code>this.refs.root()</code> observes the component&apos;s intrinsic root, generation,
					introduction phase, presentation, and structural release. Work activated by a release is
					owned by the renderer&apos;s release frame, allowing the old range to remain until
					attached tasks and cleanup settle. The retained subtree deactivates after release
					observers attach and reactivates only when exact-generation reversal restores it.
				</p>
				<div className="definition-grid">
					<code>this.state</code>
					<p>Reactive, instance-owned data.</p>
					<code>this.reactive()</code>
					<p>An explicit derived reactive value.</p>
					<code>this.map()</code>
					<p>Explicit stable-key collection rendering.</p>
					<code>this.setContext()</code>
					<p>Publishes a typed value to descendant components.</p>
					<code>this.getContext()</code>
					<p>Reads the nearest matching context value.</p>
					<code>this.ref()</code>
					<p>A DOM reference owned by this component.</p>
					<code>this.refs</code>
					<p>
						Reads ref values and observes the component&apos;s intrinsic-root identity, generation,
						introduction, and presentation.
					</p>
					<code>this.onMount()</code>
					<p>Registers mounted work with an abort signal.</p>
					<code>this.onUnmount()</code>
					<p>Registers teardown or final bookkeeping.</p>
					<code>this.onRender()</code>
					<p>Observes render timing and dependencies.</p>
					<code>this.log</code>
					<p>A component-scoped logger.</p>
				</div>
			</section>
			<Callout title="A useful dividing line">
				<p>
					Initialize capabilities during setup. Read reactive values in the returned view. Change
					them in events, tasks, or services.
				</p>
			</Callout>
		</Article>
	);
}
