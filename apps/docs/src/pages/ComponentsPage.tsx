import type { Component } from '@exactjs/core';
import { Link } from '@exactjs/router';
import { CodeBlock } from '../CodeBlock.jsx';
import { Article } from './Article.jsx';

const componentSource = `type CardState = { open: boolean };
type CardProps = { name: string; children?: Child };

function ProfileCard(this: Component<CardState>, props: CardProps) {
  // Per-instance declarations: a state default and mounted work.
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

const partitionSource = `import { partitionChildren } from '@exactjs/core/children';

function Dialog(props: { children?: Child }) {
  const parts = partitionChildren(props.children, {
    title: DialogTitle,
    actions: DialogActions
  });
  return () => (
    <section role="dialog">
      <header>{parts.title}</header>
      <main>{parts.remaining}</main>
      <footer>{parts.actions}</footer>
    </section>
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

const jsxExtraSource = `// Classic JSX strings and expressions work as expected.
<article className="card featured" />
<article className={\`card featured theme-\${props.theme}\`} />

// eXact also composes strings, arrays, truthy maps, and named tokens.
<article
  className={[
    \`card featured theme-\${props.theme}\`,
    { selected: this.state.selected, disabled: props.disabled }
  ]}
  className:compact={props.compact}
/>

// A matching prop name can be punned.
<Avatar {user} />`;

const keyedFragmentSource = `import { _ } from '@exactjs/jsx';

return () => (
  <dl>
    {this.state.people.map((person) => (
      <_ key={person.id}>
        <dt>{person.name}</dt>
        <dd>{person.role}</dd>
      </_>
    ))}
  </dl>
);`;

const compactBindingSource = `// Component prop + notification callback.
<SettingsPanel expanded:onExpandedChanged={this.state.settingsExpanded} />

// Equivalent component props:
<SettingsPanel
  expanded={this.state.settingsExpanded}
  onExpandedChanged={(expanded) => this.state.settingsExpanded = expanded}
/>

// Native property + browser event bindings.
<input value:onInput={this.state.name} />

// Equivalent native property and event handler:
<input
  value={this.state.name}
  onInput={(event) => this.state.name = event.currentTarget.value}
/>

<input type="number" value:onChange={this.state.quantity} />
<input type="checkbox" checked:onChange={this.state.subscribed} />
<input type="radio" value="ground" checked:onChange={this.state.delivery} />
<select multiple value:onChange={this.state.tags}>...</select>
<details open:onToggle={this.state.advanced}>Advanced settings</details>
<dialog modal:isOpen={this.state.settingsOpen}>Settings</dialog>`;

/** Explains compiled component state machines, component values, context, and owned tasks. */
export function ComponentsPage(this: Component<{}>) {
	return () => (
		<Article
			eyebrow="Learn"
			title="Components that persist"
			description="Build a component with inputs, its own state, and a view that updates when that state changes."
			previous={{ path: '/samples', label: 'Sample applications' }}
			next={{ path: '/learn/state', label: 'State & derived values' }}
		>
			<section>
				<h2>Give each mounted component its own state</h2>
				<p>
					A page may contain several profile cards, each with its own expanded state. In eXact, each
					mounted card has a lasting component instance. Its inputs are called
					<strong>props</strong>. Its local values live in <code>this.state</code>. Changing a state
					field updates the parts of the view that read it.
				</p>
				<CodeBlock source={componentSource} language="tsx" title="ProfileCard.tsx" />
				<p>
					Clicking the button changes this card’s <code>open</code> state. The class and conditional
					content follow that value, while the instance stays in place. Each card starts closed and
					registers its mounted work once. You can inspect its state and tasks throughout its
					lifetime in <a href="#/learn/devtools">DevTools</a>.
				</p>
				<p>
					The component body describes state defaults, calculations, tasks, and lifecycle work for
					the compiler. The returned function supplies one synchronous view expression. Put events
					and side effects in their handlers or tasks. eXact connects state changes to the work and
					view expressions that depend on them.
				</p>
			</section>
			<section>
				<h2>Keep inputs with the parent and local state with the child</h2>
				<p>
					The parent supplies <code>name</code> and <code>children</code>. The card owns whether it
					is open. Read props directly as the parent changes them, and mutate
					<code>this.state</code> for the card’s own data. Props are readonly, including arrays
					nested in ordinary objects. If a child needs to change a parent-owned value, give it a
					callback or use a value binding, shown below.
				</p>
				<p>
					<code>props.children</code> contains the content placed between a component’s opening and
					closing tags. The card displays it when open. A component may also return those children
					directly, which is useful for providing context without adding an HTML wrapper.
				</p>
				<details>
					<summary>Destructuring props and handling mutation errors</summary>
					<p>
						Flat props destructuring, including aliases and defaults, follows parent updates. Use a
						named props parameter for nested, rest, or computed bindings. Array methods such as
						<code>push()</code>, <code>splice()</code>, and <code>sort()</code> throw before
						mutating props. Read or copy props as needed, keeping mutable local data in state.
					</p>
					<p>
						Event state writes publish together, but a later exception does not undo earlier writes.
						Use <code>batch()</code> when a region needs synchronous rollback on failure.
					</p>
				</details>
			</section>
			<section>
				<h2>Reuse markup without creating another stateful component</h2>
				<p>
					A long view can be easier to read when named pieces sit beside it. A local PascalCase
					arrow that returns JSX is called a <strong>micro-component</strong>. It shares the
					surrounding component’s state, so extracting a footer does not require passing every value
					through another layer of props.
				</p>
				<CodeBlock source={microComponentSource} language="tsx" title="Article.tsx" />
				<p>
					Here, <code>Footer</code> reads the article’s state and <code>Page</code> composes the
					parts. They share the article’s lifecycle and task ownership. For a reusable component
					that needs its own state and lifetime, declare it at module scope with a PascalCase name.
					Nested stateful component definitions are rejected.
				</p>
				<p>
					Ordinary helpers can also return JSX. Pass individual values or a props object, using
					either an inline object type or a named type. Their output stays connected to reactive
					inputs. Local micro-components can contain enhancements such as <code>time:update</code>.
					Each use has its own range of output while remaining owned by the surrounding component.
				</p>
			</section>
			<section>
				<h2>Arrange children into a shared layout</h2>
				<p>
					A dialog may need to place its title, body, and actions in different regions while letting
					callers supply them as children. <code>partitionChildren()</code> groups those immediate
					children so the dialog can arrange them without recreating their content.
				</p>
				<CodeBlock source={partitionSource} language="tsx" title="Dialog layout" />
				<p>
					Each child enters the first matching group. Unmatched children go into
					<code>remaining</code>, and order stays the same within each group. Write the children you
					want to select directly inside the parent: partitioning does not execute a nested
					component to inspect what it will render. This example shows layout. A complete dialog
					also needs <a href="#/components/accessibility">accessible naming and interaction</a>.
				</p>
				<details>
					<summary>Selectors and child transformation helpers</summary>
					<p>
						Selectors accept component types, intrinsic tag names, <code>childKinds.text</code>
						for strings and numbers, or arrays of those choices. Arrays of children flatten, empty
						values disappear, and explicit fragments remain one opaque child.
					</p>
					<p>
						For an intrinsic child, <code>childrenOf(element)</code> reads its immediate contents.
						<code>withChildren(element, replacement)</code> derives an element with new contents
						while retaining attribute bindings, key, refs, and enhancements. These helpers compose
						renderable values. They do not move already-mounted component instances.
					</p>
				</details>
			</section>
			<section>
				<h2>Share a value with descendants</h2>
				<p>
					Passing the same theme or service through every intermediate component clutters their
					props. A <strong>context</strong> lets a provider publish a typed value for descendants.
					They read it using the same token, and the nearest matching provider supplies the value.
				</p>
				<CodeBlock source={contextSource} language="tsx" title="ThemeContext.tsx" />
				<p>
					Reactive context values stay reactive. For an opaque service or class instance, configure
					the token with <code>reactive: false</code> to preserve its identity. If a provider is
					optional, check <code>this.hasContext(token)</code> before reading it. A broad catch
					around context lookup could hide an unrelated failure.
				</p>
			</section>
			<section>
				<h2>Choose which component to display</h2>
				<p>
					A results page may switch between a grid and a list. Put that choice in an ordinary
					expression in the component body and use the selected component as a JSX tag. Changing the
					selection replaces only that part of the page.
				</p>
				<CodeBlock source={componentValueSource} language="tsx" title="Results.tsx" />
				<p>
					For a shared set of choices or views loaded on demand, use
					<code>createComponentRegistry()</code>. The
					<a href="#/learn/component-registries">dynamic component guide</a> covers typed keys, lazy
					loading, and the explicit client-only boundary for open-ended component lookups.
				</p>
			</section>
			<section>
				<h2>Connect work to the component’s inputs</h2>
				<p>
					A presence indicator needs to load the status for the selected user and replace that work
					when the user ID changes. A <strong>task</strong> ties the operation to the component’s
					inputs and lifetime. Calling it in the component body makes those inputs reactive.
				</p>
				<CodeBlock source={componentTaskSource} language="tsx" title="Presence.tsx" />
				<p>
					eXact starts the task for the current ID and cancels obsolete runs. The compiler can also
					infer where work belongs: browser globals imply client execution, and server-only imports
					imply server execution. Work valid in either environment may run in either. A
					<code>TaskContext.client()</code> or <code>TaskContext.server()</code> parameter makes the
					choice explicit when needed. Contradictory placement is a compiler error.
				</p>
				<Link theme:action="secondary" className="secondary-link" to="/learn/tasks">
					Learn about task status, cancellation, and cleanup
				</Link>
			</section>
			<section>
				<h2>Bind a value to its change callback</h2>
				<p>
					A parent often passes a value down and a callback to update it. When that callback simply
					assigns the new value, <code>property:eventHandler</code> can generate both props. The
					parent keeps ownership of the state. The child reports its changes through the callback.
				</p>
				<CodeBlock
					source={compactBindingSource}
					language="tsx"
					title="Component and native bindings"
				/>
				<p>
					For components, both names must be declared props, and the callback’s first argument is
					the replacement value. Use explicit props when the handler needs to validate, transform,
					reject, log, await, or return a result. Replacing a callback prop updates the existing
					child’s handler. Setting it to <code>undefined</code> removes it.
				</p>
				<p>
					Native controls have supported property/event pairs and type-aware conversion for values
					such as numbers, dates, and selections. The
					<a href="#/guides/forms">forms guide</a> explains which binding to use for each control.
				</p>
			</section>
			<section>
				<h2>Compose classes and pass matching props</h2>
				<p>
					Conditional classes can make a small element hard to scan. eXact accepts strings, arrays,
					and objects in <code>className</code>, plus named classes such as
					<code>className:compact</code>. Object keys and named classes are included when their
					values are truthy. A named class without a value is always included.
				</p>
				<CodeBlock source={jsxExtraSource} language="tsx" title="Classes and matching props" />
				<p>
					The last example uses <strong>prop punning</strong>: <code>{'<Avatar {user} />'}</code>
					means <code>{'<Avatar user={user} />'}</code>. Multiline JSX prose uses HTML-like
					whitespace collapsing, so ordinary spaces around elements and expressions are sufficient.
				</p>
				<details>
					<summary>Class merging, prop spreads, and HTML-specific behavior</summary>
					<p>
						Class contributions combine in authored prop order. Falsy contributions add nothing.
						Dynamic duplicate tokens remain. The compiler diagnoses duplicates it can prove. Named
						classes cannot be mixed with a prop spread. Use <code>className</code> for HTML
						elements. Native event props take functions, and recognized HTML prop casing is
						corrected. Component and custom-element props retain their authored casing.
					</p>
					<p>
						A JSX prop spread stays reactive. In
						<code>{'rows.map(row => <Row key={row.id} {...row} />)'}</code>, replacing the row or
						changing its fields updates the existing child. Later props win. For an intentional
						one-time shallow copy during setup, use <code>{'peek(() => ({ ...value }))'}</code>
						with <code>peek</code> imported from <code>@exactjs/core</code>.
					</p>
					<p>
						Markup inside <code>title</code> or <code>textarea</code> is literal text. For example,
						<code>{'<textarea><span>Hello</span></textarea>'}</code> displays the span markup. It
						has no live span ref or handler. Reactive text updates preserve a textarea value the
						user has edited. Raw HTML requires <code>unsafeHtml()</code> and explicit root opt-in.
						Direct HTML-writing props such as <code>innerHTML</code> are rejected.
					</p>
				</details>
			</section>
			<section>
				<h2>Group siblings without adding an element</h2>
				<p>
					One list item may render several sibling elements, such as a term and its definition. The
					imported <code>_</code> fragment gives that group one key without adding a DOM wrapper.
				</p>
				<CodeBlock
					source={keyedFragmentSource}
					language="tsx"
					title="A keyed transparent fragment"
				/>
				<p>
					Use it when the group needs props such as <code>key</code>. The shorthand fragment cannot
					receive them. See the <a href="#/learn/lists">list guide</a> for preserving each item’s
					state as a collection changes.
				</p>
			</section>
			<section>
				<h2>Access the DOM and own mounted resources</h2>
				<p>
					A focus operation or third-party widget needs access to the mounted DOM. Use
					<code>this.ref(key)</code> for a stable binding. Its reactive <code>current</code> value
					is also available through <code>this.refs.get(key)</code>, so work can respond when the
					element appears or disappears without polling.
				</p>
				<p>
					<code>this.onMount()</code> runs after the browser places the component’s DOM, when refs
					and layout are available. It receives an abort signal for cleanup and is not evaluated on
					the server. Use <code>this.own()</code> for a disposable setup resource and
					<code>this.onUnmount()</code> for final cleanup or bookkeeping.
				</p>
				<details>
					<summary>Watchers and asynchronous lifecycle work</summary>
					<p>
						Watchers created synchronously in mount callbacks stop at unmount. Watchers created in
						activation callbacks stop on deactivation and are recreated on the next activation. This
						automatic ownership does not continue after an <code>await</code>. Use the lifecycle
						signal or explicitly own asynchronous resources. Final disposal also releases queued
						reactive work, including work paused while the view was parked.
					</p>
				</details>
				<details>
					<summary>Root transitions, logging, and the component API</summary>
					<p>
						<code>this.refs.root()</code> observes the component’s root, introduction, presentation,
						and release. It can support work such as leaving animations that must finish before
						removal. A first read after mounting still exposes the current root and generation. The{' '}
						<a href="https://github.com/techjoshua/exact/blob/main/docs/component-language.md">
							component reference
						</a>{' '}
						covers transition ownership and reversal, plus <code>this.reactive()</code>,
						<code>this.map()</code>, and <code>this.onRender()</code>.
					</p>
					<p>
						<code>this.log</code> is a component-scoped logger inherited from the render or
						hydration root. Canonical level calls evaluate arguments only when enabled, and logging
						does not create reactive dependencies. Builds keep those calls so logging can be enabled
						at runtime. Trace logging includes correlated interaction, feedback, task, and rendering
						timings.
					</p>
				</details>
			</section>
		</Article>
	);
}
