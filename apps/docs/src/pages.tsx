import type { Child, Component } from '@exactjs/core';
import { Link } from '@exactjs/router';
import { CodeBlock } from './CodeBlock.jsx';
import { CounterDemo, KeyedListDemo, PriceDemo } from './Demos.jsx';
import { LogoLab } from './LogoLab.jsx';

type ArticleProps = {
	eyebrow: string;
	title: string;
	description: string;
	children?: Child | Child[];
	previous?: { path: string; label: string };
	next?: { path: string; label: string };
};

function Article(this: Component<{}>, props: ArticleProps) {
	const children = Array.isArray(props.children)
		? props.children
		: props.children === undefined
			? []
			: [props.children];
	return () => (
		<article className="article">
			<header className="article-header">
				<p className="eyebrow">{props.eyebrow}</p>
				<h1>{props.title}</h1>
				<p className="lede">{props.description}</p>
			</header>
			{children}
			<nav className="page-navigation" aria-label="Page navigation">
				{props.previous ? (
					<Link className="page-nav-link" to={props.previous.path}>
						<small>Previous</small>
						<strong>{props.previous.label}</strong>
					</Link>
				) : (
					<span />
				)}
				{props.next ? (
					<Link className="page-nav-link page-nav-link--next" to={props.next.path}>
						<small>Next</small>
						<strong>{props.next.label}</strong>
					</Link>
				) : (
					<span />
				)}
			</nav>
		</article>
	);
}

function Callout(
	this: Component<{}>,
	props: { tone?: 'note' | 'warning' | 'tip'; title: string; children?: Child | Child[] }
) {
	return () => (
		<aside className={`callout callout--${props.tone ?? 'note'}`}>
			<strong>{props.title}</strong>
			<div>{props.children}</div>
		</aside>
	);
}

const counterSource = `import type { Component } from '@exactjs/core';

type CounterState = {
  count: number;
  lastChanged: string;
};

export function CounterDemo(this: Component<CounterState>) {
  // Setup runs once for this component instance.
  this.state.count = 0;
  this.state.lastChanged = 'Nothing has changed yet.';

  // The compiler turns this pure expression into a lazy reactive value.
  const doubled = this.state.count * 2;

  const change = (amount: number) => {
    this.state.count += amount;
    this.state.lastChanged =
      \`Only the count cells changed at \${new Date().toLocaleTimeString()}.\`;
  };

  return () => (
    <section className="demo counter-demo" aria-label="Interactive counter example">
      <div>
        <p className="demo-kicker">Live eXact component</p>
        <strong className="counter-value">{this.state.count}</strong>
        <span className="counter-derived">twice that is {doubled}</span>
      </div>

      <div className="button-row">
        <button type="button" onClick={() => change(-1)}>−1</button>
        <button type="button" onClick={() => change(1)}>+1</button>
        <button
          type="button"
          onClick={() => {
            this.state.count = 0;
            this.state.lastChanged = 'Back at the starting point.';
          }}
        >
          Reset
        </button>
      </div>

      <p className="demo-status" aria-live="polite">
        {this.state.lastChanged}
      </p>
    </section>
  );
}`;

const quickStartCounterSource = `import type { Component } from '@exactjs/core';
import { render } from '@exactjs/dom';

function Counter(this: Component<{ count: number }>) {
  this.state.count = 0;

  return () => (
    <button onClick={() => this.state.count++}>
      Count: {this.state.count}
    </button>
  );
}

render(<Counter />, document.getElementById('app')!);`;

export function IntroductionPage(this: Component<{}>) {
	return () => (
		<Article
			eyebrow="Welcome to eXact"
			title="Write the component. Do not rerun it."
			description="eXact is a compiler-led web framework built around long-lived TypeScript components, precise reactive updates, and automatic client/server coordination. Component setup runs once; the expressions that depend on changing state stay connected."
			next={{ path: '/learn/components', label: 'Components' }}
		>
			<section>
				<h2>Why another web framework?</h2>
				<p>
					React is the current center of gravity for web interfaces, and for good reason: its component model
					is expressive, its ecosystem is enormous, and Hooks made stateful composition feel like ordinary
					function calls. But Hooks are not ordinary calls. Their meaning depends on stable execution order,
					and every render calls the component again to produce another description of the interface.
				</p>
				<p>
					That also means a function component has no durable, inspectable component object containing its
					state. React owns that state behind the Hook dispatcher. Testing visible behavior is excellent
					discipline, but it does not make internal state irrelevant: when a component misbehaves, being able
					to inspect its actual state, tasks, and resources is useful for tests, diagnostics, and plain old
					debugging.
				</p>
				<p>
					React calls component functions repeatedly to produce a new description of the interface. Given
					that need to continually rerender components, the virtual DOM is an effective general solution, but
					it comes at a cost: run the render logic, create the next description, compare it with the previous
					one, then commit the necessary changes. As components grow, identity-sensitive work, side effects,
					and expensive calculations increasingly move into Hooks and memoization so repeated execution
					remains safe. eXact asks what the source could look like if that repeated execution were
					unnecessary.
				</p>
			</section>

			<section>
				<h2>The alternatives move the tradeoff</h2>
				<div className="card-grid">
					<div className="topic-card">
						<span className="topic-index">React</span>
						<strong>Familiar JSX, positional state</strong>
						<p>
							Hooks compose elegantly, but their order is part of the runtime protocol and state remains
							indirectly owned by React.
						</p>
					</div>
					<div className="topic-card">
						<span className="topic-index">Vue</span>
						<strong>Reactivity, with another authoring model</strong>
						<p>
							Vue makes reactivity central, but its primary view language is templates and primitive refs
							are boxed, requiring <code>.value</code> in TypeScript even where templates unwrap them.
						</p>
					</div>
					<div className="topic-card">
						<span className="topic-index">Svelte</span>
						<strong>Compilation, with a framework dialect</strong>
						<p>
							Svelte avoids a virtual DOM, but runes such as <code>$state</code>, <code>$derived</code>,
							and <code>$effect</code> make reactivity a distinct syntax to learn and recognize.
						</p>
					</div>
				</div>
			</section>

			<Callout title="The eXact sweet spot" tone="tip">
				<p>
					Keep TSX. Keep direct, inspectable state on a long-lived component. Let a compiler connect each
					state read to the DOM, task, or server operation that depends on it. The source stays small and
					understandable while the generated program handles subscriptions, cleanup, placement, transport,
					and updates.
				</p>
			</Callout>

			<section className="hero-grid">
				<div className="hero-copy">
					<p className="demo-kicker">See the model</p>
					<h2>One setup, precise updates</h2>
					<p>
						Use the controls to change one state field. The displayed count and doubled value are separate
						reactive expressions. The component remains alive, its state remains inspectable, and its
						function does not run again after a click.
					</p>
					<div className="hero-actions">
						<Link className="primary-link" to="/learn/components">
							Understand the component <span aria-hidden="true">{'->'}</span>
						</Link>
						<Link className="secondary-link" to="/examples/logo-lab">
							Try a larger demo
						</Link>
					</div>
				</div>
				<CounterDemo />
			</section>

			<section>
				<h2>Here is the whole component</h2>
				<p>
					The component body is setup: initialize state, define derived values, register tasks, and assemble
					services. The returned function describes the view. State reads look like ordinary property access,
					but the compiler preserves them as independently connected update boundaries.
				</p>
				<CodeBlock source={counterSource} language="tsx" title="CounterDemo.tsx" />
			</section>

			<section>
				<h2>Why use this model?</h2>
				<div className="card-grid">
					<div className="topic-card">
						<span className="topic-index">State</span>
						<strong>Write normal-looking TypeScript</strong>
						<p>Read and assign instance state directly. Pure derived constants remain ordinary expressions in source.</p>
					</div>
					<div className="topic-card">
						<span className="topic-index">Updates</span>
						<strong>Keep work local</strong>
						<p>The compiler gives text, props, styles, branches, and keyed collections their own update boundaries.</p>
					</div>
					<div className="topic-card">
						<span className="topic-index">Lifetime</span>
						<strong>Give work an owner</strong>
						<p>Tasks, cancellation, disposable resources, context, refs, and cleanup belong to a long-lived component instance.</p>
					</div>
				</div>
			</section>

			<section>
				<h2>One readable model across client and server</h2>
				<p>
					eXact applies the same compiler-visible ownership to asynchronous and distributed work. A component
					can mix browser interaction with server operations without making transport code the organizing
					idea of the component. The compiler analyzes placement and produces the client and server artifacts,
					manifests, state transfer, and lifecycle boundaries needed to connect them.
				</p>
				<p>
					This is deliberate syntactic sugar: a small amount of familiar TypeScript expands into operations
					that would be complex and repetitive by hand. The generated machinery can be sophisticated without
					forcing the component source to become sophisticated too. State, DOM updates, async lifetime,
					server placement, and cleanup remain parts of one understandable component.
				</p>
				<Link className="secondary-link" to="/compare">See the detailed comparison</Link>
			</section>

			<section>
				<h2>Continue from the idea, not the installer</h2>
				<div className="card-grid">
					<Link className="topic-card" to="/learn/components">
						<span className="topic-index">01</span>
						<strong>Understand components</strong>
						<p>See setup, views, props, context, tasks, refs, and the complete instance surface.</p>
					</Link>
					<Link className="topic-card" to="/learn/state">
						<span className="topic-index">02</span>
						<strong>Follow reactivity</strong>
						<p>See what the compiler infers and how direct state becomes precise DOM work.</p>
					</Link>
					<Link className="topic-card" to="/plugins">
						<span className="topic-index">03</span>
						<strong>Explore the platform</strong>
						<p>Learn how plugins carry cross-cutting concerns through compiler and runtime hosts.</p>
					</Link>
				</div>
			</section>
			<section>
				<h2>Where it stands today</h2>
				<p>
					eXact is under active development. The docs distinguish implemented behavior from future direction,
					and the examples use the repository's current package workflow. That maturity affects adoption, but
					it is context for evaluating the framework rather than the framework's headline feature.
				</p>
			</section>
		</Article>
	);
}

const packageJsonSource = `{
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build"
  },
  "dependencies": {
    "@exactjs/core": "workspace:*",
    "@exactjs/dom": "workspace:*",
    "@exactjs/jsx": "workspace:*",
    "@exactjs/vite-plugin": "workspace:*",
    "vite": "^5.4.0"
  }
}`;

const tsconfigSource = `{
  "compilerOptions": {
    "lib": ["ES2022", "DOM"],
    "jsx": "preserve",
    "jsxImportSource": "@exactjs/jsx"
  },
  "include": ["src", "vite.config.ts"]
}`;

const viteSource = `import { exact } from '@exactjs/vite-plugin';

export default {
  // Compile TSX expression boundaries before Vite bundles the app.
  plugins: [exact()]
};`;

export function GettingStartedPage(this: Component<{}>) {
	return () => (
		<Article
			eyebrow="Start here"
			title="Build a browser app"
			description="The shortest honest path today starts inside the eXact workspace. We will configure Vite, write one component, and let the compiler preserve its reactive expressions."
			previous={{ path: '/', label: 'Introduction' }}
			next={{ path: '/learn/components', label: 'Components' }}
		>
			<Callout title="Repository-first setup" tone="tip">
				<p>
					The packages are currently developed together in this repository. These examples use workspace
					dependencies rather than pretending a public package-install story is already settled.
				</p>
			</Callout>

			<section>
				<h2>1. Give the app its tools</h2>
				<p>Create a workspace application and connect the small set of packages needed for browser rendering.</p>
				<CodeBlock source={packageJsonSource} language="json" title="package.json" />
			</section>

			<section>
				<h2>2. Tell TypeScript who owns JSX</h2>
				<p>
					The JSX package provides TypeScript’s runtime entrypoints and element types. The compiler plugin
					turns those expressions into eXact’s fine-grained boundaries.
				</p>
				<CodeBlock source={tsconfigSource} language="json" title="tsconfig.json" />
			</section>

			<section>
				<h2>3. Add the compiler to Vite</h2>
				<CodeBlock source={viteSource} language="ts" title="vite.config.ts" />
			</section>

			<section>
				<h2>4. Mount a component</h2>
				<CodeBlock source={quickStartCounterSource} language="tsx" title="src/main.tsx" />
				<CodeBlock source={`npm install\nnpm run dev`} language="shell" title="Terminal" compact />
			</section>

			<section>
				<h2>What the compiler changes</h2>
				<p>
					Uncompiled JSX can describe a static tree, but JavaScript has already reduced expressions to plain
					values. The eXact compiler preserves each expression as a reactive cell so a text value, property,
					style, or child can update at its own boundary.
				</p>
			</section>
		</Article>
	);
}

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
					<code>this</code> and reactive props as the second argument. Then read the returned function as the
					view: expressions inside it stay attached to the DOM boundaries created by the compiler.
				</p>
				<CodeBlock source={componentSource} language="tsx" title="ProfileCard.tsx" />
				<p>
					Each mounted <code>ProfileCard</code> gets its own state, task scope, context boundary, refs, and
					lifecycle. Props remain parent-owned input. An event can assign state directly because the compiler
					has already connected consumers of that field.
				</p>
			</section>
			<section>
				<h2>Components can provide services to descendants</h2>
				<p>
					Context is explicit and scoped to the component tree. A provider calls
					<code>this.setContext()</code>; descendants call <code>this.getContext()</code> with the same typed
					token. Reactive context values remain reactive, while tokens configured with
					<code>reactive: false</code> preserve opaque service identity.
				</p>
				<CodeBlock source={contextSource} language="tsx" title="ThemeContext.tsx" />
			</section>
			<section>
				<h2>Tasks make work part of the component</h2>
				<p>
					A task is not an after-render callback. It is a setup declaration for work owned by this instance.
					Dependency expressions come before the callback; when one changes, eXact aborts the old generation
					and starts the next.
				</p>
				<CodeBlock source={componentTaskSource} language="tsx" title="Presence.tsx" />
				<p>
					The compiler also analyzes environment usage. Browser globals imply client placement, server-only
					imports imply server placement, and state-writing work with neither can be isomorphic. If an opaque
					call makes placement unknowable, or intent matters more than inference, use
					<code>this.task.client()</code> or <code>this.task.server()</code>. Contradictory placement is a
					compile error rather than a runtime surprise.
				</p>
				<Link className="secondary-link" to="/learn/tasks">Follow task inference and cleanup</Link>
			</section>
			<section>
				<h2>The instance surface, after the model</h2>
				<div className="definition-grid">
					<code>this.state</code><p>Reactive, instance-owned data.</p>
					<code>this.reactive()</code><p>An explicit derived reactive value.</p>
					<code>this.task()</code><p>Owned synchronous or asynchronous work with reactive dependencies.</p>
					<code>this.task.client()</code><p>Work explicitly retained in the client build.</p>
					<code>this.task.server()</code><p>Work explicitly retained in the server build.</p>
					<code>this.map()</code><p>Explicit stable-key collection rendering.</p>
					<code>this.setContext()</code><p>Publishes a typed value to descendant components.</p>
					<code>this.getContext()</code><p>Reads the nearest matching context value.</p>
					<code>this.ref()</code><p>A DOM reference owned by this component.</p>
					<code>this.refs</code><p>Reads values published through the instance's ref bindings.</p>
					<code>this.onMount()</code><p>Registers mounted work with an abort signal.</p>
					<code>this.onUnmount()</code><p>Registers teardown or final bookkeeping.</p>
					<code>this.onRender()</code><p>Observes render timing and dependencies.</p>
					<code>this.log</code><p>A component-scoped logger.</p>
				</div>
			</section>
			<Callout title="A useful dividing line">
				<p>Initialize capabilities during setup. Read reactive values in the returned view. Change them in events, tasks, or services.</p>
			</Callout>
		</Article>
	);
}

const derivedSource = `type PriceState = {
  quantity: number;
  price: number;
  express: boolean;
};

function Price(this: Component<PriceState>) {
  this.state.quantity = 3;
  this.state.price = 24;
  this.state.express = false;

  // These pure setup expressions become shared, lazy derived values.
  const subtotal = this.state.quantity * this.state.price;
  const shipping = this.state.express ? 14 : subtotal >= 75 ? 0 : 6;
  const total = subtotal + shipping;

  return () => (
    <section>
      <label>
        Quantity: {this.state.quantity}
        <input
          type="range"
          min="1"
          max="8"
          value:input={this.state.quantity}
        />
      </label>
      <label>
        Unit price: \${this.state.price}
        <input
          type="range"
          min="8"
          max="60"
          step="2"
          value:input={this.state.price}
        />
      </label>
      <label>
        <input
          type="checkbox"
          checked:change={this.state.express}
        />
        Express delivery
      </label>

      <dl>
        <div><dt>Subtotal</dt><dd>\${subtotal}</dd></div>
        <div><dt>Delivery</dt><dd>{shipping === 0 ? 'Free' : \`$\${shipping}\`}</dd></div>
        <div><dt>Total</dt><dd>\${total}</dd></div>
      </dl>
    </section>
  );
}`;

const explicitDerivedSource = `// This is the public, explicit equivalent of the compiler's
// derived-value model. The callback tracks quantity and price.
const subtotal = this.reactive(
  () => this.state.quantity * this.state.price
);

// Reactive values can be used directly in JSX...
return () => <strong>\${subtotal}</strong>;

// ...or can own a task that reruns with their current value.
subtotal.task((value, { signal }) => {
  reportEstimate(Number(value), { signal });
});`;

export function StatePage(this: Component<{}>) {
	return () => (
		<Article
			eyebrow="Learn"
			title="State that reads like state"
			description="Read a field when you need it. Assign to it when something changes. Safe derived constants stay cached and update their consumers precisely."
			previous={{ path: '/learn/components', label: 'Components' }}
			next={{ path: '/learn/lists', label: 'Keyed lists' }}
		>
			<section>
				<h2>Reactivity is the connective tissue</h2>
				<p>
					eXact state is a deeply reactive object owned by one component instance. Reading a field from a
					compiled derived expression, DOM expression, keyed collection, or task dependency records the
					connection. Assigning that field invalidates those consumers; it does not schedule the component
					function to execute again.
				</p>
				<p>
					This is how direct TypeScript stays precise. The compiler keeps source expressions intact long
					enough to turn them into lazy reactive cells, while the runtime tracks which fields each cell
					actually reads.
				</p>
			</section>
			<PriceDemo />
			<section>
				<h2>The demo and its complete source</h2>
				<p>
					Move the controls above and watch subtotal, delivery, and total follow the same dependency graph.
					The component below is the full shape of that demo rather than an abbreviated result-only version.
				</p>
				<CodeBlock source={derivedSource} language="tsx" title="Price.tsx" />
			</section>
			<section>
				<h2>What the inferred form means</h2>
				<p>
					For a safe setup constant such as <code>subtotal</code>, the compiler emits an internal lazy
					derived value. The public <code>this.reactive()</code> API expresses the same relationship when you
					want to name the boundary yourself, work without the transform, or attach a fluent task.
				</p>
				<CodeBlock source={explicitDerivedSource} language="tsx" title="Explicit derived value" />
				<p>
					The explicit form is not “more reactive” than the inferred form. It is the visible spelling of a
					boundary the compiler can normally derive from the code.
				</p>
			</section>
			<section>
				<h2>Where reactive values can flow</h2>
				<div className="definition-grid">
					<code>Text and props</code><p>Update a text node, property, attribute, class, or style at its own boundary.</p>
					<code>Branches</code><p>Replace only the dynamic child region selected by a condition.</p>
					<code>Derived constants</code><p>Compute lazily and share the result between multiple consumers.</p>
					<code>Lists</code><p>Reconcile collection membership while preserving keyed item identity.</p>
					<code>Tasks</code><p>Abort and rerun owned work when an explicit dependency changes.</p>
					<code>Context</code><p>Carry reactive configuration or data through descendants without prop plumbing.</p>
				</div>
			</section>
		</Article>
	);
}

const keyedSource = `type Todo = {
  /** @exact key: this field is the item's stable identity. */
  id: string;
  text: string;
};

function TodoList(this: Component<{ todos: Todo[] }>) {
  this.state.todos = [];

  return () => (
    <ul>
      {/* The compiler lowers ordinary map syntax to keyed reconciliation. */}
      {this.state.todos.map((todo) => <li>{todo.text}</li>)}
    </ul>
  );
}`;

export function ListsPage(this: Component<{}>) {
	return () => (
		<Article
			eyebrow="Learn"
			title="Lists keep the identity you give them"
			description="Use ordinary map syntax and mark the field that means identity. Reorders then move the existing item rather than quietly turning it into a different one."
			previous={{ path: '/learn/state', label: 'State & derived values' }}
			next={{ path: '/learn/tasks', label: 'Tasks & cleanup' }}
		>
			<section>
				<h2>Why identity matters</h2>
				<p>
					A list is not only an array of rendered strings. Each row may own input selection, focus, local
					component state, a running task, or a DOM node another system references. If an item moves and the
					renderer identifies rows only by position, that owned state can silently attach to the wrong data.
				</p>
				<p>
					eXact asks for stable identity so it can move the existing item boundary instead of recreating it or
					relabeling a neighboring boundary. Duplicate keys fail deterministically because guessing would risk
					state corruption.
				</p>
			</section>
			<KeyedListDemo />
			<section>
				<h2>What the Reading Queue demonstrates</h2>
				<p>
					Expand one reading item, then move the first row to the end. The expanded state follows the item
					identified by its <code>id</code>; it does not remain stuck to the first position. That small demo is
					the visible version of the same guarantee needed by editable rows and stateful child components.
				</p>
			</section>
			<section>
				<h2>Declare identity on the data</h2>
				<CodeBlock source={keyedSource} language="tsx" title="TodoList.tsx" />
				<p>
					The framework owns the JSX key. Duplicate keys fail deterministically rather than falling back to
					position and risking state corruption. String arrays use the string value as their key.
				</p>
			</section>
			<section>
				<h2>When the explicit form is clearer</h2>
				<p>
					Use <code>{'this.map(collection, item => item.id, render)'}</code> when the selector belongs next to
					the view, when the data type cannot carry an <code>@exact key</code> annotation, or when you need
					the distinction between eXact's keyed rendering and native <code>Array.map()</code> to be obvious.
				</p>
				<CodeBlock
					source={`return () => this.map(\n  this.state.todos,\n  // Identity is explicit at the rendering boundary.\n  (todo) => todo.id,\n  (todo) => <TodoRow todo={todo} />\n);`}
					language="tsx"
					title="Explicit keyed rendering"
				/>
			</section>
		</Article>
	);
}

const taskSource = `function Search(this: Component<SearchState>) {
  this.state.query = '';
  this.state.results = [];

  // The first argument is a reactive dependency. The compiler changes the
  // direct state expression into this.reactive(() => this.state.query).
  this.task(this.state.query, async (query, { signal }) => {
    if (!query.trim()) {
      this.state.results = [];
      return;
    }

    const response = await fetch('/api/search?q=' + encodeURIComponent(query), {
      signal
    });
    this.state.results = await response.json();
  });

  return () => <SearchView results={this.state.results} />;
}`;

const ownedResourcesSource = `function LivePanel(this: Component<{}>) {
  this.task.client(() => {
    // The compiler supplies the task signal to cancellable calls.
    fetch('/api/snapshot');
    window.addEventListener('resize', measure);

    // Known resources are disposed with this task generation.
    const socket = new WebSocket('/events');       // close()
    const observer = new ResizeObserver(measure);  // disconnect()
    const timer = setInterval(refresh, 5_000);      // clearInterval()
    const subscription = store.subscribe(refresh); // unsubscribe()

    // Returning cleanup remains available for an unknown resource.
    const custom = openCustomChannel();
    return () => custom.release();
  });

  return () => <Dashboard />;
}`;

const placedTasksSource = `import { readFile } from 'node:fs/promises';

function ProjectPage(this: Component<ProjectState>) {
  // Inferred server: this task reaches a server-only import.
  this.task(async () => {
    this.state.title = await readFile('title.txt', 'utf8');
  });

  // Inferred client: this task reads a browser global.
  this.task(() => {
    this.state.width = window.innerWidth;
  });

  // Manual placement is for intent the compiler cannot prove.
  this.task.client(() => opaqueBrowserLibrary.start());
  this.task.server(() => opaqueServerLibrary.warmCache());

  return () => <h1>{this.state.title}</h1>;
}`;

export function TasksPage(this: Component<{}>) {
	return () => (
		<Article
			eyebrow="Learn"
			title="Work follows the component"
			description="Tasks are setup declarations for work the component owns. Dependencies rerun the task; reruns and unmounts cancel the previous generation."
			previous={{ path: '/learn/lists', label: 'Keyed lists' }}
			next={{ path: '/guides/routing', label: 'Routing' }}
		>
			<section>
				<h2>Why tasks are a framework primitive</h2>
				<p>
					Async work creates ownership questions: which inputs make it stale, who cancels it, where is it
					allowed to run, and what resources must be released? eXact tasks answer those questions at component
					setup instead of scattering them across effects, controller variables, and unmount callbacks.
				</p>
			</section>
			<section>
				<h2>Dependencies define generations</h2>
				<p>
					Expressions before the task callback are dependencies. The compiler recognizes direct state and prop
					expressions and wraps them as reactive values. When a dependency changes, eXact aborts the current
					generation, waits for registered cleanup as needed, and invokes the callback with current unwrapped
					values.
				</p>
				<CodeBlock source={taskSource} language="tsx" title="Search.tsx" />
				<p>
					For the search above, changing <code>query</code> aborts the older fetch before a new request begins.
					The same generation signal aborts when the component unmounts, preventing a stale response from
					continuing as live component work.
				</p>
			</section>
			<section>
				<h2>The compiler also looks for owned resources</h2>
				<p>
					Task analysis recognizes cancellable calls and values with known disposal protocols. It can combine
					the task's <code>AbortSignal</code> with a fetch or listener call, clear timers, disconnect
					observers, close sockets and channels, terminate workers, unsubscribe subscriptions, and invoke
					<code>Symbol.dispose</code> or <code>Symbol.asyncDispose</code>.
				</p>
				<CodeBlock source={ownedResourcesSource} language="tsx" title="LivePanel.tsx" />
				<p>
					Ownership is generation-scoped, not merely component-scoped: a rerun disposes resources from the
					previous inputs before creating replacements. If a resource escapes into component state or the
					compiler cannot preserve its expression result safely, compilation asks you to move it or dispose it
					explicitly rather than pretending ownership is solved.
				</p>
			</section>
			<section>
				<h2>Server and client placement is useful, not mysterious</h2>
				<p>
					In a split build, the compiler follows effects through task calls. Browser globals and browser-only
					APIs select the client. Server-only imports select the server. Environment-neutral state-writing
					work can be isomorphic so server rendering may run it and hydration can avoid duplicating initial
					work.
				</p>
				<CodeBlock source={placedTasksSource} language="tsx" title="ProjectPage.tsx" />
				<p>
					Explicit placement is not a discouraged last resort. It is the correct declaration when an opaque
					library hides its environment behavior or when architecture requires a specific side. The compiler
					still checks for contradictions, such as a server task that references <code>window</code>.
				</p>
			</section>
		</Article>
	);
}

const routerSource = `function Layout() {
  // Outlet renders the child selected beneath this layout route.
  return () => <main><Navigation /><Outlet /></main>;
}

render(
  <Router basename="/app">
    {/* Child routes inherit the Layout component above. */}
    <Route component={Layout}>
      <Route index component={Home} />
      <Route path="users/:id" component={User} />
      {/* Keep the not-found rule last and local to this router. */}
      <Route path="*" component={NotFound} />
    </Route>
  </Router>,
  document.getElementById('app')!
);`;

export function RoutingPage(this: Component<{}>) {
	return () => (
		<Article
			eyebrow="Build for the web"
			title="Routes are components too"
			description="The native router matches component references, nests layouts through outlets, and runs against browser history, URL hashes, memory, or an ambient server request."
			previous={{ path: '/learn/tasks', label: 'Tasks & cleanup' }}
			next={{ path: '/guides/forms', label: 'Accessible forms' }}
		>
			<Callout title="You are looking at it" tone="tip">
				<p>This documentation shell uses <code>Router</code>, nested <code>Route</code> components, <code>Outlet</code>, <code>Link</code>, and <code>NavLink</code>.</p>
			</Callout>
			<section>
				<h2>A nested application shell</h2>
				<CodeBlock source={routerSource} language="tsx" title="main.tsx" />
			</section>
			<section>
				<h2>Choose a location source deliberately</h2>
				<table>
					<thead><tr><th>Mode</th><th>Good fit</th><th>Important detail</th></tr></thead>
					<tbody>
						<tr><td>History</td><td>Apps with server rewrites</td><td>Clean paths and direct SSR support</td></tr>
						<tr><td>Hash</td><td>Static hosts such as GitHub Pages</td><td>Refreshes need no rewrite</td></tr>
						<tr><td>Memory</td><td>Tests and build-time rendering</td><td>Deterministic and browser-free</td></tr>
					</tbody>
				</table>
			</section>
		</Article>
	);
}

const formSource = `<Form onValidSubmit={(_event, data) => save(data)}>
  <Field
    name="email"
    required
    // A validator returns true or a user-facing error.
    validate={(value) => String(value).includes('@') || 'Enter an email'}
  >
    {/* Field context wires these native pieces together accessibly. */}
    <Label>Email</Label>
    <Input type="email" />
    <FieldHelp>We only use this for account messages.</FieldHelp>
    <FieldError />
  </Field>
  <button type="submit">Save</button>
</Form>`;

const reactiveInputSource = `function ProfileEditor(this: Component<{
  name: string;
  quantity: number | null;
  subscribed: boolean;
  delivery: 'ground' | 'express';
  carriers: ('ups' | 'usps')[];
  tags: string[];
}>) {
  return () => (
    <form>
      <input value:input={this.state.name} />
      <input type="number" value:change={this.state.quantity} />
      <input type="checkbox" checked:change={this.state.subscribed} />

      <input
        type="radio"
        value="ground"
        checked:change={this.state.delivery}
      />

      <input
        type="checkbox"
        value="ups"
        checked:change={this.state.carriers}
      />

      <select multiple value:change={this.state.tags}>...</select>
    </form>
  );
}`;

const manualInputSource = `// Ordinary controlled input:
<input
  value={this.state.name}
  onInput={(event) => {
    this.state.name = event.currentTarget.value;
  }}
/>

// The same property projection and write-back relationship:
<input value:input={this.state.name} />`;

const bindingEffectsSource = `<input
  value:input={this.state.name}
  onInput={() => {
    // The binding has already updated state.
    this.log.info('Name edited', { name: this.state.name });
  }}
/>`;

const invalidInputBindingsSource = `// A binding needs one writable location, not a derived value.
<input value:input={\`\${this.state.first} \${this.state.last}\`} />

// Checkboxes project their checked property, not their value property.
<input type="checkbox" value:change={this.state.enabled} />

// Select controls commit through change, not input.
<select value:input={this.state.status}>...</select>

// The compiler generates value, so an explicit value would conflict.
<input value={this.state.name} value:input={this.state.name} />

// An array-bound checkbox needs the value it will add or remove.
<input type="checkbox" checked:change={this.state.filters} />`;

export function FormsPage(this: Component<{}>) {
	return () => (
		<Article
			eyebrow="Build for the web"
			title="Reactive inputs and accessible fields"
			description="Connect native controls to component state without repetitive assignment handlers, then compose labels, help, errors, and validation without surrendering ownership of the data."
			previous={{ path: '/guides/routing', label: 'Routing' }}
			next={{ path: '/guides/testing', label: 'Testing' }}
		>
			<section>
				<h2>Name the property and the event</h2>
				<p>
					A controlled input normally repeats the same state path twice: once to project state into a DOM
					property and once to copy the browser's next value back during an event. eXact supports a narrow
					<code>property:event</code> notation for that recurring relationship.
				</p>
				<CodeBlock source={manualInputSource} language="tsx" title="Equivalent input code" />
				<p>
					The compiler still emits a reactive <code>value</code> or <code>checked</code> property and a
					lifecycle-owned native listener. The notation removes mechanical code; it does not introduce a
					general directive or event system.
				</p>
			</section>
			<section>
				<h2>The supported forms are deliberately small</h2>
				<CodeBlock source={reactiveInputSource} language="tsx" title="ProfileEditor.tsx" />
				<div className="table-scroll">
					<table>
						<thead>
							<tr><th>Notation</th><th>Controls</th><th>State</th></tr>
						</thead>
						<tbody>
							<tr><td><code>value:input</code></td><td>Input and textarea</td><td>String, number, date, or nullable variants</td></tr>
							<tr><td><code>value:change</code></td><td>Input, textarea, select, and multi-select</td><td>Scalar values or a string/number array for multi-select</td></tr>
							<tr><td><code>checked:change</code></td><td>Checkbox and radio input</td><td>Boolean, radio value, or string/number checkbox array</td></tr>
						</tbody>
					</table>
				</div>
				<p>
					The bound type selects the browser conversion. Numbers use the numeric control value, dates use the
					date value, nullable fields return their declared empty value, radio buttons compare their declared
					<code>value</code>, and grouped checkboxes add or remove that value from the array.
				</p>
			</section>
			<section>
				<h2>Authored handlers still handle authored behavior</h2>
				<CodeBlock source={bindingEffectsSource} language="tsx" title="InputWithAudit.tsx" />
				<p>
					A separate <code>onInput</code> or <code>onChange</code> handler may validate, log, persist, or
					coordinate other state. The direct binding listener runs first, so the authored handler reads the
					updated value. Both listeners are removed when the element is removed.
				</p>
			</section>
			<section>
				<h2>Compiler errors keep the shorthand honest</h2>
				<CodeBlock source={invalidInputBindingsSource} language="tsx" title="InvalidBindings.tsx" />
				<p>
					A binding must identify exactly one writable property or element access. The compiler rejects
					derived expressions, the wrong DOM property or event for a control, conflicting explicit
					<code>value</code> or <code>checked</code> props, checkbox arrays without an option value,
					unsupported state types, and a union containing both <code>null</code> and <code>undefined</code>
					where the empty representation would be ambiguous.
				</p>
			</section>
			<section>
				<h2>Compose validation around native controls</h2>
				<CodeBlock source={formSource} language="tsx" title="AccountForm.tsx" />
				<p>
					Fields validate on first blur and submit, then revalidate invalid values on input. Callback validators
					may be asynchronous; stale results are ignored.
				</p>
			</section>
			<section>
				<h2>Composition preserves native behavior</h2>
				<p>
					Labels remain labels, inputs remain inputs, and the browser still participates in validation. Form
					context coordinates the accessible relationships rather than replacing them with a proprietary
					field model.
				</p>
			</section>
		</Article>
	);
}

const testingSource = `// Configure props and context before mounting the real component.
const view = await testComponent(Counter)
  .props({ initial: 1 })
  .context(AuthContext, auth)
  .mount();

// Prefer an accessible query and a user-shaped action.
await view.root.getByRole('button', { name: 'Increment' }).click();

// Inspect internal state only when behavior alone is not enough.
expect(view.root.state().count).toBe(2);
expect(view.root.find(Status).context(AuthContext)).toBe(auth);
view.unmount();`;

export function TestingPage(this: Component<{}>) {
	return () => (
		<Article
			eyebrow="Build for the web"
			title="Test behavior through the real component"
			description="Mount the DOM-rendered component, find controls the way a user does, and inspect framework state only when the test truly needs it."
			previous={{ path: '/guides/forms', label: 'Accessible forms' }}
			next={{ path: '/guides/react-compatibility', label: 'React compatibility' }}
		>
			<section>
				<h2>One fluent test surface</h2>
				<CodeBlock source={testingSource} language="ts" title="Counter.test.tsx" />
				<p>
					Queries are available by role and name, label, visible text, selector, and test ID. Singular queries
					reject both missing and ambiguous matches.
				</p>
			</section>
			<section>
				<h2>Settling is explicit</h2>
				<p>
					State and event actions flush reactive rendering and wait for observed component tasks. Long-lived
					work can opt out, while <code>view.flush()</code> and <code>view.settle()</code> keep timing choices visible.
				</p>
			</section>
		</Article>
	);
}

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
			title="Adopt React code without adopting two application architectures"
			description="eXact includes compatibility runtimes for supported React 18 and 19 code, build-time JSX ownership, DOM and server entry aliases, and explicit boundaries between native eXact and React-shaped components."
			previous={{ path: '/guides/testing', label: 'Testing' }}
			next={{ path: '/plugins', label: 'Plugin system' }}
		>
			<section>
				<h2>Why compatibility belongs in the framework</h2>
				<p>
					A new framework is easier to evaluate when existing packages and migration work do not become an
					all-or-nothing rewrite. Compatibility mode lets a build recognize selected React-owned modules,
					rewrite their runtime imports, and render them through eXact's compatibility layer while native
					eXact components keep their own model.
				</p>
				<p>
					This is an adoption bridge, not a claim that every package in the React ecosystem is automatically
					supported. Packages can depend on undocumented reconciler behavior or host assumptions; adapter
					discovery and validation exist for those cases.
				</p>
			</section>
			<section>
				<h2>Select React-owned source deliberately</h2>
				<CodeBlock source={reactCompatibilitySource} language="ts" title="vite.config.ts" />
				<p>
					The target may be React 18 or 19, or can be detected from an installed React package. Explicit
					<code>@jsxImportSource react</code> and <code>@jsxImportSource @exactjs/jsx</code> directives take
					precedence over source filters, which keeps ownership visible in mixed projects.
				</p>
			</section>
			<section>
				<h2>Interop is explicit where models meet</h2>
				<CodeBlock source={reactInteropSource} language="tsx" title="interop.tsx" />
				<p>
					Compatibility includes shared context tokens, a native component boundary for React-owned JSX, and a
					<code>ReactHost</code> component for hosting React component types from eXact. Explicit boundaries
					preserve tree shaking and make it clear which semantics apply on each side.
				</p>
			</section>
			<section>
				<h2>What is implemented today</h2>
				<div className="definition-grid">
					<code>Build aliases</code><p>React, JSX runtime, React DOM client, server, and React 19 static entrypoints.</p>
					<code>React majors</code><p>Separate compatibility targets for React 18 and React 19.</p>
					<code>Core runtime</code><p>React-shaped elements, function and class support, hooks, context, refs, suspense, and compatible roots.</p>
					<code>Package adapters</code><p>Discovery and version validation for packages needing targeted compatibility rules.</p>
					<code>Interop</code><p>Shared contexts, native component exposure, React hosting, and node conversion.</p>
					<code>Guardrails</code><p>Strict JSX ownership and reconciler-major validation fail early when a build is ambiguous.</p>
				</div>
			</section>
		</Article>
	);
}

const pluginConfigSource = `export default {
  plugins: {
    // Each installed plugin owns a typed configuration transform.
    microfrontends(config) {
      config.providedPackages.push('@acme/design-system');
    },
    secrets(config) {
      config.required.push('DATABASE_URL');
    }
  }
};`;

export function PluginsPage(this: Component<{}>) {
	return () => (
		<Article
			eyebrow="Extend eXact"
			title="Plugins carry cross-cutting concerns through the whole system"
			description="An eXact plugin is a package contract, not a bag of component hooks. It can contribute typed configuration and validated behavior to compiler, server, render, client, or testing hosts."
			previous={{ path: '/guides/react-compatibility', label: 'React compatibility' }}
			next={{ path: '/plugins/microfrontends', label: 'Microfrontends' }}
		>
			<section>
				<h2>Why plugins exist</h2>
				<p>
					Concerns such as secrets, remote deployment, policy, tracing, or localization do not live cleanly
					inside one component. They may affect source analysis, generated manifests, server startup, request
					lifetime, rendered output, browser boot, and tests. A plugin lets one package describe those parts
					without teaching each bundler or application a private integration protocol.
				</p>
			</section>
			<section>
				<h2>One package, several bounded hosts</h2>
				<div className="definition-grid">
					<code>config</code><p>Defines defaults, validation, typed transforms, and host-specific projections.</p>
					<code>compiler</code><p>Analyzes declared directives, emits diagnostics, and contributes bounded JSON manifest data.</p>
					<code>server</code><p>Initializes application- or request-owned resources and server projections.</p>
					<code>render</code><p>Validates or transforms rendered output at explicit output boundaries.</p>
					<code>client</code><p>Provides browser-safe configuration or runtime initialization.</p>
					<code>testing</code><p>Supplies deterministic test-host behavior for the same concern.</p>
				</div>
				<p>
					A plugin declares only the entries it needs. Host projections are loaded for the relevant mode, so
					a server implementation does not become browser code by accident.
				</p>
			</section>
			<section>
				<h2>Discovery and configuration are package-based</h2>
				<p>
					The host discovers plugin declarations from package metadata, resolves configuration contributors
					in deterministic dependency order, validates the final value, and fingerprints compiler-safe
					configuration for manifests and caches. Required plugin protocol mismatches fail before application
					code runs.
				</p>
				<CodeBlock source={pluginConfigSource} language="ts" title="exact.config.ts" />
				<p>
					Configuration transforms may mutate the provided value or return a replacement. Generated type
					augmentation makes installed plugin keys available through <code>@exactjs/config</code>.
				</p>
			</section>
			<section>
				<h2>The plugins in this repository</h2>
				<div className="card-grid">
					<Link className="topic-card" to="/plugins/microfrontends">
						<span className="topic-index">Build + runtime</span>
						<strong>Microfrontends</strong>
						<p>Compile explicit exposures, bind trusted remotes, share packages, mount logical child roots, and recover across deployments.</p>
					</Link>
					<Link className="topic-card" to="/plugins/secrets">
						<span className="topic-index">Policy + server</span>
						<strong>Secrets</strong>
						<p>Load required values from providers and preserve compiler-visible secret qualification until an audited consume boundary.</p>
					</Link>
				</div>
			</section>
		</Article>
	);
}

const remoteProducerSource = `export default {
  plugins: {
    microfrontends(config) {
      config.providedPackages.push('@acme/design-system');

      // Public exposure name -> component source root.
      config.exposes['./Billing'] = {
        component: './src/Billing.tsx'
      };
    }
  }
};`;

const remoteConsumerSource = `export default {
  plugins: {
    microfrontends(config) {
      config.providedPackages.push('@acme/design-system');

      // The public client entry and private action endpoint are separate.
      config.remotes.billing = {
        clientEntry: 'https://cdn.acme.test/billing/remote.js',
        endpoint: 'https://billing.internal/__exact'
      };
    }
  }
};`;

const remoteComponentSource = `import { RemoteComponent } from '@exactjs/microfrontends/client';

function BillingSlot(this: Component<{}>) {
  const account = this.getContext(AccountContext);

  return () => (
    <RemoteComponent
      binding="billing"
      props={{ accountId: account.id }}
      fallback={<p role="alert">Billing is unavailable.</p>}
    />
  );
}`;

export function MicrofrontendsPluginPage(this: Component<{}>) {
	return () => (
		<Article
			eyebrow="Plugin / @exactjs/microfrontends"
			title="Independent deployment with component-shaped integration"
			description="The microfrontends plugin compiles named eXact component roots as remote entries and lets a host mount them through trusted bindings, without reducing the remote to an iframe or an untyped module factory."
			previous={{ path: '/plugins', label: 'Plugin system' }}
			next={{ path: '/plugins/secrets', label: 'Secrets' }}
		>
			<section>
				<h2>Why this plugin exists</h2>
				<p>
					Independent teams need deployment boundaries, but the page still needs coherent component
					ownership, props, context, server actions, package identity, failure handling, and upgrades. Those
					require cooperation from the compiler, bundler, hydration client, and server gateway—exactly the
					kind of cross-cutting concern the plugin system is designed to own.
				</p>
			</section>
			<section>
				<h2>A producer exposes explicit roots</h2>
				<CodeBlock source={remoteProducerSource} language="ts" title="billing/exact.config.ts" />
				<p>
					The build compiles the exposure and its reachable artifacts, generates a canonical remote entry, and
					records a build key. <code>providedPackages</code> describes packages whose identity must be bridged
					between page and remote rather than duplicated casually.
				</p>
			</section>
			<section>
				<h2>A consumer owns trusted bindings</h2>
				<CodeBlock source={remoteConsumerSource} language="ts" title="page/exact.config.ts" />
				<p>
					The browser receives only the client entry binding it needs. The private endpoint remains a server
					concern, where the eXact binding gateway validates and forwards action and refresh traffic.
				</p>
			</section>
			<section>
				<h2>The page renders a normal component boundary</h2>
				<CodeBlock source={remoteComponentSource} language="tsx" title="BillingSlot.tsx" />
				<p>
					<code>RemoteComponent</code> loads and validates the entry, installs its manifest into an isolated
					execution root, passes props and children, and owns disposal. A binding change replaces the remote
					generation. Failed loads render the supplied fallback.
				</p>
			</section>
			<section>
				<h2>Deployment recovery is part of the contract</h2>
				<p>
					Remote entries carry a content-derived build key. When a server reports that a browser's build is no
					longer supported, the client can resolve a current entry, replace the remote module, and preserve
					the page-owned root around it. Cross-root structural patches rotate the remote component descriptor
					instead of pretending two independently built trees are one local bundle.
				</p>
			</section>
			<Callout title="Trust boundary" tone="warning">
				<p>
					Remote endpoints are application-configured trusted systems. The plugin validates module shape and
					manifest contracts; it is not a sandbox for hostile code.
				</p>
			</Callout>
		</Article>
	);
}

const secretsConfigSource = `export default {
  plugins: {
    secrets(config) {
      // The default provider reads process.env and optional .env files.
      config.required.push('DATABASE_URL', 'STRIPE_SECRET_KEY');

      // Only named dependency packages may contain consume() boundaries.
      config.allowPackages.push('@acme/payments');
    }
  }
};`;

const secretsUseSource = `import { consume, type Secret } from '@exactjs/secrets';

declare const secrets: {
  require(name: string): Secret<string>;
};

const credential = secrets.require('STRIPE_SECRET_KEY');

// Secret qualification propagates through expressions.
const authorization = 'Bearer ' + credential;

// Deliberately end tracking in trusted server code.
const client = createStripeClient(consume(authorization));`;

export function SecretsPluginPage(this: Component<{}>) {
	return () => (
		<Article
			eyebrow="Plugin / @exactjs/secrets"
			title="Make secret handling visible to both server and compiler"
			description="The secrets plugin loads values through application-owned providers, validates required names at startup, and gives secret data a compiler-visible qualification that persists until trusted code explicitly consumes it."
			previous={{ path: '/plugins/microfrontends', label: 'Microfrontends' }}
			next={{ path: '/examples/logo-lab', label: 'Logo lab' }}
		>
			<section>
				<h2>Why a secret needs more than an environment lookup</h2>
				<p>
					Loading a value is the easy part. The harder question is where that value flows after loading:
					through string composition, helper calls, server output, client artifacts, or dependencies. A
					<code>{'Secret<T>'}</code> is the runtime value with a compile-time policy qualification, allowing
					eXact analysis to follow the concern beyond the provider call.
				</p>
			</section>
			<section>
				<h2>Configure providers and policy once</h2>
				<CodeBlock source={secretsConfigSource} language="ts" title="exact.config.ts" />
				<p>
					The built-in environment provider reads process environment values and optional <code>.env</code>
					files. Applications can add providers implementing the same async interface. Later providers replace
					earlier values with the same name, and startup fails when a required name remains missing.
				</p>
			</section>
			<section>
				<h2>Consumption is an audited decision</h2>
				<CodeBlock source={secretsUseSource} language="ts" title="payments.server.ts" />
				<p>
					Passing a qualified secret to an ordinary parameter is rejected unless that parameter explicitly
					accepts <code>{'Secret<T>'}</code>. <code>consume()</code> ends tracking at a deliberate server
					boundary. For dependency code, the package containing that call must also appear in
					<code>allowPackages</code>; trust does not automatically spread to its downstream consumers.
				</p>
			</section>
			<section>
				<h2>Lifecycle belongs to the server host</h2>
				<p>
					The plugin prepares its resolver for the server projection, initializes providers at application
					startup, validates required values, and clears resolved values on disposal. The compiler projection
					receives only a bounded policy cache key and allowlist—not the loaded secret values.
				</p>
			</section>
		</Article>
	);
}

export function LogoLabPage(this: Component<{}>) {
	return () => (
		<Article
			eyebrow="Explore · client-only"
			title="Logo lab"
			description="Edit a small Logo program and give the turtle instructions. The parser is bounded, the animation belongs to the component, and the drawing remains data rather than an opaque bitmap."
			previous={{ path: '/plugins/secrets', label: 'Secrets' }}
			next={{ path: '/compare', label: 'Framework comparison' }}
		>
			<LogoLab />
			<section>
				<h2>Why this is an eXact-shaped example</h2>
				<div className="card-grid">
					<div className="topic-card"><span className="topic-index">State</span><strong>The program is data</strong><p>Source, instructions, position, heading, segments, and progress are reactive fields.</p></div>
					<div className="topic-card"><span className="topic-index">Life</span><strong>The timer has an owner</strong><p>Animation starts after mount and is aborted when its component leaves the page.</p></div>
					<div className="topic-card"><span className="topic-index">View</span><strong>The inspector stays precise</strong><p>Coordinates and progress update independently while keyed segments accumulate.</p></div>
				</div>
			</section>
			<section>
				<h2>A deliberately small language</h2>
				<p>
					The interpreter accepts movement, turns, pen control, four semantic colors, and nested
					<code> REPEAT </code>blocks. It never uses <code>eval()</code>. Source length, nesting, repeats, numeric
					range, and expanded command count are bounded before execution.
				</p>
			</section>
		</Article>
	);
}

export function ComparisonPage(this: Component<{}>) {
	return () => (
		<Article
			eyebrow="Explore"
			title="Choose a model, not a winner"
			description="React, Vue, Svelte, and eXact can all build serious interfaces. The useful comparison is where each framework puts state, update work, lifecycle, and ecosystem boundaries—and which tradeoffs fit your application."
			previous={{ path: '/examples/logo-lab', label: 'Logo lab' }}
			next={{ path: '/advanced', label: 'Beyond the browser' }}
		>
			<section>
				<h2>The short comparison</h2>
				<div className="table-scroll"><table>
					<thead>
						<tr><th>Concern</th><th>eXact</th><th>React</th><th>Vue</th><th>Svelte</th></tr>
					</thead>
					<tbody>
						<tr>
							<td>Component model</td>
							<td>Long-lived instance; setup returns a connected view.</td>
							<td>Function components are called to produce the next UI description.</td>
							<td>Component instance with Options or Composition API setup and a reactive render effect.</td>
							<td>Compiled component source using Svelte syntax and runes.</td>
						</tr>
						<tr>
							<td>State</td>
							<td>Direct fields on a deeply reactive instance object.</td>
							<td>Hooks or external stores; setters schedule rendering.</td>
							<td>Reactive proxies and refs, with computed values and watchers.</td>
							<td><code>$state</code>, <code>$derived</code>, and related runes in current syntax.</td>
						</tr>
						<tr>
							<td>Update model</td>
							<td>Compiler-preserved expression boundaries update directly.</td>
							<td>Render, compare, then commit necessary host changes.</td>
							<td>Tracked reactivity schedules optimized virtual-DOM component updates.</td>
							<td>Compiler-generated reactive updates with push-pull derived propagation.</td>
						</tr>
						<tr>
							<td>Async ownership</td>
							<td>Tasks combine dependencies, cancellation, placement, and resource disposal.</td>
							<td>Effects and framework/library conventions; cleanup is returned from effects.</td>
							<td>Watchers, effects, lifecycle hooks, and surrounding application framework conventions.</td>
							<td>Effects, lifecycle, async template features, and SvelteKit conventions.</td>
						</tr>
						<tr>
							<td>Ecosystem today</td>
							<td>Small and repository-first; includes targeted React compatibility.</td>
							<td>Very large package, renderer, and framework ecosystem.</td>
							<td>Large ecosystem with an official application framework.</td>
							<td>Mature compiler framework with SvelteKit and a growing package ecosystem.</td>
						</tr>
					</tbody>
				</table></div>
			</section>
			<section>
				<h2>Where eXact is making a distinct bet</h2>
				<p>
					eXact combines four decisions that are often separate: long-lived component instances, compiler
					inference over ordinary TSX, fine-grained reactive DOM expressions, and compiler-visible ownership
					of async and distributed work. The goal is not merely fewer DOM operations; it is one analyzable
					model from a state read through tasks, server placement, manifests, hydration, and plugins.
				</p>
				<div className="card-grid">
					<div className="topic-card">
						<span className="topic-index">Compared with React</span>
						<strong>Setup is not render</strong>
						<p>The component body initializes an instance once. Updates do not require calling that body to produce another tree.</p>
					</div>
					<div className="topic-card">
						<span className="topic-index">Compared with Vue</span>
						<strong>More inference from TSX</strong>
						<p>Reactive objects are familiar, while the compiler also lifts safe local derivations and expression boundaries.</p>
					</div>
					<div className="topic-card">
						<span className="topic-index">Compared with Svelte</span>
						<strong>TSX plus an instance protocol</strong>
						<p>Both make strong compiler bets; eXact keeps TSX and exposes task, context, logging, and plugin ownership on the instance.</p>
					</div>
				</div>
			</section>
			<section>
				<h2>Reasons not to choose eXact yet</h2>
				<p>
					Choose an established alternative when public-package stability, a broad hiring pool, third-party
					UI libraries, production case studies, or a large support community outweigh eXact's model. eXact's
					current setup is repository-first, and some distributed protocols are still expanding.
				</p>
			</section>
			<section>
				<h2>Reasons to evaluate it</h2>
				<p>
					eXact is worth a close look when you want direct mutable-looking state without component rerender
					semantics; when async cancellation and cleanup are central rather than incidental; when compiler,
					server, hydration, and plugin boundaries should share one manifest model; or when React
					compatibility can make a gradual trial realistic.
				</p>
			</section>
			<Callout title="Comparison basis">
				<p>
					This page compares documented programming models, not synthetic benchmark scores. Performance,
					bundle size, and team productivity depend on the application and should be measured with a real
					vertical slice.
				</p>
				<p>
					Primary references: <a href="https://react.dev/learn/render-and-commit" target="_blank" rel="noreferrer">React render and commit</a>,
					{' '}<a href="https://vuejs.org/guide/extras/reactivity-in-depth.html" target="_blank" rel="noreferrer">Vue reactivity</a>, and
					{' '}<a href="https://svelte.dev/docs/svelte/overview" target="_blank" rel="noreferrer">Svelte overview</a>.
				</p>
			</Callout>
		</Article>
	);
}

type AdvancedCard = { /** @exact key */ title: string; text: string; packages: string };
const advancedCards: AdvancedCard[] = [
	{ title: 'SSR and hydration', text: 'Render boundary-marked HTML, then adopt it without discarding useful server work.', packages: '@exactjs/ssr · @exactjs/hydrate' },
	{ title: 'Server components', text: 'Compile client and server artifacts with manifest-allowlisted actions and refresh boundaries.', packages: '@exactjs/compiler · @exactjs/server' },
	{ title: 'Streaming', text: 'Produce document events or browser-ready progressive HTML while respecting cancellation and backpressure.', packages: '@exactjs/ssr' },
	{ title: 'React compatibility', text: 'Run supported React packages through compatibility runtimes and ecosystem adapters.', packages: '@exactjs/react-compat' },
	{ title: 'Build adapters', text: 'Use the compiler through Vite, Webpack, Bun, or the exactc precompile workflow.', packages: '@exactjs/vite-plugin · @exactjs/webpack-plugin' },
	{ title: 'Microfrontends', text: 'Describe exposures, resolve remote components, and recover boundaries through an explicit plugin.', packages: '@exactjs/microfrontends' }
];

export function AdvancedPage(this: Component<{}>) {
	return () => (
		<Article
			eyebrow="Explore"
			title="Beyond the browser"
			description="The browser component model is the approachable center. Around it, eXact is developing a compiler-led path through servers, streams, hydration, and other ecosystems."
			previous={{ path: '/compare', label: 'Framework comparison' }}
			next={{ path: '/packages', label: 'Package map' }}
		>
			<Callout title="Read this as capability, not a production promise" tone="warning">
				<p>The foundation is implemented and tested, but the distributed component protocol is still expanding. Consult the repository’s focused architecture documents before adopting these paths.</p>
			</Callout>
			<section>
				<h2>The wider system</h2>
				<div className="card-grid advanced-grid">
					{advancedCards.map((card) => (
						<div className="topic-card">
							<strong>{card.title}</strong>
							<p>{card.text}</p>
							<code>{card.packages}</code>
						</div>
					))}
				</div>
			</section>
			<section>
				<h2>Start at the center</h2>
				<p>Build a client component first. Add routing and forms. Test it. Reach for hydration or server placement when the application has a concrete reason to cross that boundary.</p>
			</section>
		</Article>
	);
}

type PackageGroup = { /** @exact key */ title: string; intro: string; packages: { /** @exact key */ name: string; purpose: string }[] };
const packageGroups: PackageGroup[] = [
	{ title: 'Build an interface', intro: 'The small browser-facing center.', packages: [
		{ name: '@exactjs/core', purpose: 'Components, state ownership, context, tasks, lifecycle, and errors.' },
		{ name: '@exactjs/dom', purpose: 'Browser mounting, patching, events, refs, keyed reconciliation, and CSS units.' },
		{ name: '@exactjs/jsx', purpose: 'TypeScript JSX runtime entrypoints and namespace types.' }
	] },
	{ title: 'Add web essentials', intro: 'Common application structure without a second component model.', packages: [
		{ name: '@exactjs/router', purpose: 'Nested history/hash routing, links, outlets, and data operations.' },
		{ name: '@exactjs/forms', purpose: 'Accessible field composition and synchronous or async validation.' },
		{ name: '@exactjs/testing', purpose: 'Component mounting, accessible queries, events, state, and runner adapters.' }
	] },
	{ title: 'Compile and deliver', intro: 'Tools that preserve eXact semantics across build targets.', packages: [
		{ name: '@exactjs/compiler', purpose: 'Transforms, analysis, artifacts, manifests, sessions, and the exactc CLI.' },
		{ name: '@exactjs/vite-plugin', purpose: 'Vite integration over the shared compiler.' },
		{ name: '@exactjs/webpack-plugin', purpose: 'Webpack resolution, conditions, and transform integration.' },
		{ name: '@exactjs/bun-plugin', purpose: 'Bun transform and resolution hooks.' }
	] },
	{ title: 'Cross the server boundary', intro: 'Rendering and secure distributed work.', packages: [
		{ name: '@exactjs/ssr', purpose: 'String, document, and progressive rendering with hydration markers.' },
		{ name: '@exactjs/hydrate', purpose: 'DOM adoption, client operations, and safe server patch application.' },
		{ name: '@exactjs/server', purpose: 'Manifest-allowlisted actions and refresh handling.' }
	] },
	{ title: 'Extend and interoperate', intro: 'Cross-cutting packages that participate in more than one host.', packages: [
		{ name: '@exactjs/plugin-api', purpose: 'Versioned declarations for configuration, compiler, runtime, output, and lifecycle extensions.' },
		{ name: '@exactjs/plugin-host', purpose: 'Package discovery, ordered configuration, validation, projections, and plugin lifecycle.' },
		{ name: '@exactjs/microfrontends', purpose: 'Remote exposure builds, trusted bindings, logical remote roots, and deployment recovery.' },
		{ name: '@exactjs/secrets', purpose: 'Secret providers, server lifecycle, compiler qualification, and audited consumption.' },
		{ name: '@exactjs/react-compat', purpose: 'React 18/19 compatibility runtimes, build transforms, package adapters, and interop.' },
		{ name: '@exactjs/react-dom-compat', purpose: 'React DOM-compatible client, server, and static entrypoints.' }
	] }
];

export function PackagesPage(this: Component<{}>) {
	return () => (
		<Article
			eyebrow="Explore"
			title="Find the package that owns the job"
			description="The package surface is broad because platform boundaries are explicit. Most browser applications begin with only core, DOM, JSX, and the compiler integration."
			previous={{ path: '/advanced', label: 'Beyond the browser' }}
		>
			{packageGroups.map((group) => (
				<section className="package-group">
					<h2>{group.title}</h2>
					<p>{group.intro}</p>
					<div className="package-list">
						{group.packages.map((item) => (
							<div><code>{item.name}</code><span>{item.purpose}</span></div>
						))}
					</div>
				</section>
			))}
			<Callout title="Living examples" tone="tip">
				<p>The repository also includes Kanban, Workbench, Shipping Calculator, server-component, and microfrontend applications. They are executable companions to these guides.</p>
			</Callout>
		</Article>
	);
}

export function NotFoundPage(this: Component<{}>) {
	return () => (
		<article className="article not-found">
			<p className="eyebrow">404 · a quiet wrong turn</p>
			<h1>That page is not in this map.</h1>
			<p className="lede">The documentation may have moved, or the turtle may have taken an ambitious turn.</p>
			<Link className="primary-link" to="/">Return to the introduction</Link>
		</article>
	);
}
