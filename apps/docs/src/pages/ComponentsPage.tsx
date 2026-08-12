import type { Component } from '@exactjs/core';
import { Link } from '@exactjs/router';
import { CodeBlock } from '../CodeBlock.jsx';
import { Article } from './Article.jsx';
import { Callout } from './Callout.jsx';

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
			description="The component body describes its state, behavior, and reactive relationships; the returned view describes how it is rendered. The compiler connects both in one long-lived instance."
			previous={{ path: '/runtimes', label: 'Runtimes & integrations' }}
			next={{ path: '/learn/state', label: 'State & derived values' }}
		>
			<section>
				<h2>Connect behavior to a view</h2>
				<p>
					The component body describes state defaults, tasks, lifecycle behavior, reactive
					relationships, and preparation for the instance available as <code>this</code>. The
					returned view describes how the component is rendered. Expressions in that view remain
					connected to compiler-created DOM boundaries, allowing affected regions to update
					independently.
				</p>
				<CodeBlock source={componentSource} language="tsx" title="ProfileCard.tsx" />
				<p>
					Each mounted <code>ProfileCard</code> gets its own state, task scope, context boundary,
					refs, and lifecycle. Props remain parent-owned input. An event can assign state directly
					because the compiler has already turned the component description into a reactive state
					machine and connected every consumer of that field.
				</p>
				<p>
					The returned function is synchronous and contains one view expression. Put declarations
					and source control flow in the component body; compiled reactive regions update
					independently instead of rerunning arbitrary view code. State writes, task or lifecycle
					declarations, scheduling, and known DOM or storage effects belong in the component body, a
					task, or an interaction callback according to their documented semantics.
				</p>
			</section>
			<section>
				<h2>Lexical micro-components</h2>
				<CodeBlock source={microComponentSource} language="tsx" title="Lexical micro-components" />
				<p>
					A component-body-local, PascalCase view arrow is a micro-component. It captures the owning
					component&apos;s <code>this</code>, may compose other micro-components in scope, and
					receives no separate component identity, state, lifecycle, or task scope. Module-level
					shared or bound render callables are not component views.
				</p>
			</section>
			<section>
				<h2>JS-eXtra</h2>
				<p>
					eXact keeps JSX familiar while adding a small set of compiler-aware conveniences where
					ordinary JSX would otherwise require extra ceremony.
				</p>
				<CodeBlock
					source={jsxExtraSource}
					language="tsx"
					title="Class composition and prop punning"
				/>
				<p>
					A classic string or template-string <code>className</code> remains ordinary JSX. Arrays
					flatten strings and nested contributions; object keys contribute their class when the
					value is truthy; and <code>className:name</code> conditionally contributes one statically
					known token. A valueless namespaced class is unconditional.
				</p>
				<p>
					When forms are mixed, eXact composes them in authored prop order into one DOM class value.
					Falsy contributions add nothing. Dynamic duplicate tokens are retained, while the compiler
					diagnoses duplicates it can prove statically. A namespaced class cannot be mixed with a
					prop spread, and intrinsic elements use <code>className</code>, not
					<code>class</code>.
				</p>
				<p>
					Prop punning passes an in-scope value under its own name, so{' '}
					<code>{'<Avatar {user} />'}</code>
					means <code>{'<Avatar user={user} />'}</code>. Multiline JSX prose also uses HTML-like
					whitespace collapsing, so ordinary spaces around elements and expressions do not require
					manual <code>{"{' '}"}</code> literals.
				</p>
				<h3>Compact value bindings</h3>
				<p>
					The compact <code>property:eventHandler</code> form connects a writable state location to
					a value prop and the callback that publishes its replacement. On a component, both names
					must be ordinary declared props on the child component. Here, <code>expanded</code> is an
					ordinary value prop and <code>onExpandedChanged</code> is an ordinary callback prop. The
					parent still owns <code>this.state.settingsExpanded</code>; the shorthand passes its
					current value down and assigns the callback&apos;s first argument back to that state path.
				</p>
				<CodeBlock
					source={compactBindingSource}
					language="tsx"
					title="Component and intrinsic bindings"
				/>
				<p>
					Native controls use a deliberately finite set of property/event pairs.
					<code>value:onInput</code> follows each input or textarea edit;
					<code>value:onChange</code> commits input, textarea, select, and multi-select values; and
					<code>checked:onChange</code> handles booleans, radio values, or checkbox arrays. Details
					use <code>open:onToggle</code>, while dialogs use the bidirectional native-modal binding
					<code>modal:isOpen</code>.
				</p>
				<p>
					The compiler selects number, date, nullable, radio, checkbox-array, and multi-select
					conversion from the element and state type. Use explicit value and callback props when the
					callback needs to validate, transform, refuse, log, await, or return a result.
				</p>
				<Link className="secondary-link" to="/guides/forms">
					Explore reactive inputs and component bindings
				</Link>
				<CodeBlock
					source={keyedFragmentSource}
					language="tsx"
					title="A keyed transparent fragment"
				/>
				<p>
					The imported <code>_</code> fragment accepts a <code>key</code> while adding no DOM
					wrapper. Use it when one keyed list item renders several siblings; the standard shorthand
					fragment cannot receive props.
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
					selected component replaces only that subtree. Keep the choice as an
					initialization-derived value; the compiler observes its dependencies while the returned
					view stays one expression. When the choice comes from a reusable named collection, declare
					its complete key set with
					<code>createComponentRegistry()</code>. A valid open-ended lookup becomes a warned,
					client-only dynamic boundary because it cannot join the static client/server graph. Use it
					only intentionally with <code>createDynamicComponent()</code> or a narrow
					<code>@exact dynamic</code> annotation. Invalid component values remain errors.
				</p>
				<Link className="secondary-link" to="/learn/component-registries">
					Read the dynamic component guide
				</Link>
				<CodeBlock source={componentValueSource} language="tsx" title="Results.tsx" />
			</section>
			<section>
				<h2>Tasks make work part of the component</h2>
				<p>
					A task is not an after-render callback. It is a compiler-recognized definition for work
					owned by this instance. State, prop, and reactive context reads are inferred as
					dependencies; when one changes, eXact aborts the old generation and starts the next.
				</p>
				<CodeBlock source={componentTaskSource} language="tsx" title="Presence.tsx" />
				<p>
					The compiler also analyzes environment usage. Browser globals imply client placement,
					server-only imports imply server placement, and state-writing work with neither can be
					isomorphic. If an opaque call makes placement unknowable, or intent matters more than
					inference, add a final <code>TaskContext</code> parameter with
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
					Its reactive <code>current</code> value is also available through
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
					<p>
						A component-scoped, runtime-configurable logger. Canonical level calls defer all
						argument evaluation until that level is enabled; builds never erase them.
					</p>
				</div>
			</section>
			<Callout title="The working model">
				<p>
					The component body describes instance state, derived values, tasks, lifecycle, and other
					owned capabilities. The returned view describes how they appear. Events, tasks, and
					services mutate state directly, and eXact updates the connected work.
				</p>
			</Callout>
		</Article>
	);
}
