import type { Component } from '@exactjs/core';
import { Link } from '@exactjs/router';
import { CodeBlock } from '../CodeBlock.jsx';
import { Article, Callout } from './Article.jsx';

const componentSource = `type CardState = { open: boolean };
type CardProps = { name: string; children?: Child };

function ProfileCard(this: Component<CardState>, props: CardProps) {
  // Setup: this code runs once for each mounted ProfileCard instance.
  this.state.open = false;
  this.onMount(() => this.log.info('Profile mounted'));

  // View: the returned function keeps reactive expressions connected.
  return () => (
    <article>
      <button onClick={() => this.state.open = !this.state.open}>
        {props.name}
      </button>
      {this.state.open ? props.children : null}
    </article>
  );
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

  // props.userId is a dependency. The compiler wraps this direct
  // expression as a reactive value before registering the task.
  this.task(props.userId, async (userId, { signal }) => {
    const response = await fetch('/api/presence/' + userId, { signal });
    this.state.status = (await response.json()).status;
  });

  return () => <span>{this.state.status}</span>;
}`;

export function ComponentsPage(this: Component<{}>) {
	return () => (
		<Article
			eyebrow="Learn"
			title="Components are long-lived instances"
			description="A component function is setup, not a rerender loop. It initializes state and services once, then returns the view that stays connected to them."
			previous={{ path: '/', label: 'Introduction' }}
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
			</section>
			<section>
				<h2>Components can provide services to descendants</h2>
				<p>
					Context is explicit and scoped to the component tree. A provider calls
					<code>this.setContext()</code>; descendants call <code>this.getContext()</code> with the
					same typed token. Reactive context values remain reactive, while tokens configured with
					<code>reactive: false</code> preserve opaque service identity.
				</p>
				<CodeBlock source={contextSource} language="tsx" title="ThemeContext.tsx" />
			</section>
			<section>
				<h2>Tasks make work part of the component</h2>
				<p>
					A task is not an after-render callback. It is a setup declaration for work owned by this
					instance. Dependency expressions come before the callback; when one changes, eXact aborts
					the old generation and starts the next.
				</p>
				<CodeBlock source={componentTaskSource} language="tsx" title="Presence.tsx" />
				<p>
					The compiler also analyzes environment usage. Browser globals imply client placement,
					server-only imports imply server placement, and state-writing work with neither can be
					isomorphic. If an opaque call makes placement unknowable, or intent matters more than
					inference, use
					<code>this.task.client()</code> or <code>this.task.server()</code>. Contradictory
					placement is a compile error rather than a runtime surprise.
				</p>
				<Link className="secondary-link" to="/learn/tasks">
					Follow task inference and cleanup
				</Link>
			</section>
			<section>
				<h2>The instance surface, after the model</h2>
				<div className="definition-grid">
					<code>this.state</code>
					<p>Reactive, instance-owned data.</p>
					<code>this.reactive()</code>
					<p>An explicit derived reactive value.</p>
					<code>this.task()</code>
					<p>Owned synchronous or asynchronous work with reactive dependencies.</p>
					<code>this.task.client()</code>
					<p>Work explicitly retained in the client build.</p>
					<code>this.task.server()</code>
					<p>Work explicitly retained in the server build.</p>
					<code>this.map()</code>
					<p>Explicit stable-key collection rendering.</p>
					<code>this.setContext()</code>
					<p>Publishes a typed value to descendant components.</p>
					<code>this.getContext()</code>
					<p>Reads the nearest matching context value.</p>
					<code>this.ref()</code>
					<p>A DOM reference owned by this component.</p>
					<code>this.refs</code>
					<p>Reads values published through the instance's ref bindings.</p>
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
