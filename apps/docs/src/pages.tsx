import type { Child, Component } from '@exact/core';
import { Link } from '@exact/router';
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

const counterSource = `import type { Component } from '@exact/core';
import { render } from '@exact/dom';

function Counter(this: Component<{ count: number }>) {
  this.state.count = 0;
  const doubled = this.state.count * 2;

  return () => (
    <button onClick={() => this.state.count++}>
      Count: {this.state.count} · doubled: {doubled}
    </button>
  );
}

render(<Counter />, document.getElementById('app')!);`;

export function IntroductionPage(this: Component<{}>) {
	return () => (
		<Article
			eyebrow="Welcome to eXact"
			title="Reactive interfaces with ordinary TypeScript"
			description="eXact combines component instances, reactive state, and compiler-guided DOM updates. You write familiar TSX; eXact remembers the expressions that can change."
			next={{ path: '/getting-started', label: 'Quick start' }}
		>
			<section className="hero-grid">
				<div className="hero-copy">
					<h2>A small mental model</h2>
					<ol className="principles">
						<li>
							<strong>Construct once.</strong>
							<span>A component function creates an instance and its services.</span>
						</li>
						<li>
							<strong>Own your state.</strong>
							<span>Each instance reads and writes its own reactive fields directly.</span>
						</li>
						<li>
							<strong>Update precisely.</strong>
							<span>The compiler preserves text, prop, style, and child expression boundaries.</span>
						</li>
					</ol>
					<div className="hero-actions">
						<Link className="primary-link" to="/getting-started">
							Build the counter <span aria-hidden="true">→</span>
						</Link>
						<Link className="secondary-link" to="/examples/logo-lab">
							Open the Logo lab
						</Link>
					</div>
				</div>
				<CounterDemo />
			</section>

			<section>
				<h2>The component behind that counter</h2>
				<p>
					There is no setter pair to keep aligned and no component body to rerun after every click. The
					setup code runs once; the returned view keeps its reactive expressions connected.
				</p>
				<CodeBlock source={counterSource} language="tsx" title="Counter.tsx" highlightLines={[5, 6, 9, 10]} />
			</section>

			<Callout title="Experimental, on purpose" tone="note">
				<p>
					eXact is being shaped in the open. Its core contracts are executable and the repository contains
					working applications, but it is not yet a conservative default for production software.
				</p>
			</Callout>

			<section>
				<h2>Choose your path</h2>
				<div className="card-grid">
					<Link className="topic-card" to="/learn/state">
						<span className="topic-index">01</span>
						<strong>Learn the reactive core</strong>
						<p>State, derived values, keyed lists, and component-owned work.</p>
					</Link>
					<Link className="topic-card" to="/guides/routing">
						<span className="topic-index">02</span>
						<strong>Build for the web</strong>
						<p>Routing, accessible forms, and tests that behave like users.</p>
					</Link>
					<Link className="topic-card" to="/examples/logo-lab">
						<span className="topic-index">03</span>
						<strong>Program a turtle</strong>
						<p>See state, parsing, animation, and drawing work together.</p>
					</Link>
				</div>
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
    "@exact/core": "workspace:*",
    "@exact/dom": "workspace:*",
    "@exact/jsx": "workspace:*",
    "@exact/vite-plugin": "workspace:*",
    "vite": "^5.4.0"
  }
}`;

const tsconfigSource = `{
  "compilerOptions": {
    "lib": ["ES2022", "DOM"],
    "jsx": "preserve",
    "jsxImportSource": "@exact/jsx"
  },
  "include": ["src", "vite.config.ts"]
}`;

const viteSource = `import { exact } from '@exact/vite-plugin';

export default {
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
				<CodeBlock source={tsconfigSource} language="json" title="tsconfig.json" highlightLines={[5]} />
			</section>

			<section>
				<h2>3. Add the compiler to Vite</h2>
				<CodeBlock source={viteSource} language="ts" title="vite.config.ts" highlightLines={[4]} />
			</section>

			<section>
				<h2>4. Mount a component</h2>
				<CodeBlock source={counterSource} language="tsx" title="src/main.tsx" />
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
  this.state.open = false;
  this.onMount(() => this.log.info('Profile mounted'));

  return () => (
    <article>
      <button onClick={() => this.state.open = !this.state.open}>
        {props.name}
      </button>
      {this.state.open ? props.children : null}
    </article>
  );
}`;

export function ComponentsPage(this: Component<{}>) {
	return () => (
		<Article
			eyebrow="Learn"
			title="Components are long-lived instances"
			description="A component function is setup, not a rerender loop. It initializes state and services once, then returns the view that stays connected to them."
			previous={{ path: '/getting-started', label: 'Quick start' }}
			next={{ path: '/learn/state', label: 'State & derived values' }}
		>
			<section>
				<h2>Setup on the outside, view on the inside</h2>
				<CodeBlock source={componentSource} language="tsx" title="ProfileCard.tsx" highlightLines={[5, 6, 8]} />
				<p>
					Props remain parent-owned reactive input. Component state belongs to the instance. Event handlers
					can update that state directly, and lifecycle hooks are registered during setup.
				</p>
			</section>
			<section>
				<h2>The instance surface</h2>
				<div className="definition-grid">
					<code>this.state</code><p>Reactive, instance-owned data.</p>
					<code>this.reactive()</code><p>An explicit derived reactive value.</p>
					<code>this.task()</code><p>Owned synchronous or asynchronous work.</p>
					<code>this.map()</code><p>Explicit stable-key collection rendering.</p>
					<code>this.getContext()</code><p>A descendant-scoped app service.</p>
					<code>this.ref()</code><p>A DOM reference owned by this component.</p>
					<code>this.onMount()</code><p>A lifecycle callback with an abort signal.</p>
					<code>this.log</code><p>A component-scoped logger.</p>
				</div>
			</section>
			<Callout title="A useful dividing line">
				<p>Initialize capabilities during setup. Read reactive values in the returned view. Change them in events, tasks, or services.</p>
			</Callout>
		</Article>
	);
}

const derivedSource = `function Price(this: Component<PriceState>) {
  this.state.quantity = 3;
  this.state.unitPrice = 24;
  this.state.express = false;

  const subtotal = this.state.quantity * this.state.unitPrice;
  const delivery = this.state.express ? 14 : subtotal >= 75 ? 0 : 6;
  const total = subtotal + delivery;

  return () => <strong>Total: {total}</strong>;
}`;

export function StatePage(this: Component<{}>) {
	return () => (
		<Article
			eyebrow="Learn"
			title="State that reads like state"
			description="Read a field when you need it. Assign to it when something changes. Safe derived constants stay cached and update their consumers precisely."
			previous={{ path: '/learn/components', label: 'Components' }}
			next={{ path: '/learn/lists', label: 'Keyed lists' }}
		>
			<PriceDemo />
			<section>
				<h2>Derived values stay ordinary</h2>
				<p>
					The compiler recognizes side-effect-free setup constants built from state, props, and other derived
					constants. It turns them into shared lazy cells, so several consumers reuse the same calculation.
				</p>
				<CodeBlock source={derivedSource} language="tsx" title="Price.tsx" highlightLines={[6, 7, 8, 10]} />
			</section>
			<section>
				<h2>Use the explicit form when it helps</h2>
				<CodeBlock
					source={`const query = this.reactive(() => this.state.query);\n\nquery.task(async (value, { signal }) => {\n  await search(value, { signal });\n});`}
					language="ts"
					title="Explicit reactive value"
				/>
				<p>
					The explicit form is useful in runtime-only code or when source identity matters. Everyday compiled
					TSX can usually stay direct.
				</p>
			</section>
		</Article>
	);
}

const keyedSource = `type Todo = {
  /** @exact key */
  id: string;
  text: string;
};

function TodoList(this: Component<{ todos: Todo[] }>) {
  this.state.todos = [];

  return () => (
    <ul>
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
			<KeyedListDemo />
			<section>
				<h2>Declare identity on the data</h2>
				<CodeBlock source={keyedSource} language="tsx" title="TodoList.tsx" highlightLines={[2, 12]} />
				<p>
					The framework owns the JSX key. Duplicate keys fail deterministically rather than falling back to
					position and risking state corruption. String arrays use the string value as their key.
				</p>
			</section>
			<Callout title="When explicit is clearer" tone="tip">
				<p>Use <code>this.map(collection, item =&gt; item.id, render)</code> when the selector belongs near the view or native map index semantics are needed.</p>
			</Callout>
		</Article>
	);
}

const taskSource = `function Search(this: Component<SearchState>) {
  this.state.query = '';
  this.state.results = [];

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
				<h2>A search that cancels stale requests</h2>
				<CodeBlock source={taskSource} language="tsx" title="Search.tsx" highlightLines={[5, 11, 12]} />
				<p>
					When the query changes, eXact aborts the older generation before beginning the next. The same signal
					is aborted when the component unmounts.
				</p>
			</section>
			<section>
				<h2>Resources, not effect trivia</h2>
				<p>
					Compiled tasks recognize timers, observers, fetches, sockets, workers, subscriptions, and disposable
					values. Their lifetime is tied to the task generation that created them. An explicit cleanup
					function remains available for uncommon resources.
				</p>
			</section>
			<Callout title="Placement is usually inferred">
				<p><code>this.task.client()</code> and <code>this.task.server()</code> are escape hatches for distributed builds. Start with <code>this.task()</code>.</p>
			</Callout>
		</Article>
	);
}

const routerSource = `render(
  <Router basename="/app">
    <Route component={Layout}>
      <Route index component={Home} />
      <Route path="users/:id" component={User} />
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
    validate={(value) => String(value).includes('@') || 'Enter an email'}
  >
    <Label>Email</Label>
    <Input type="email" />
    <FieldHelp>We only use this for account messages.</FieldHelp>
    <FieldError />
  </Field>
  <button type="submit">Save</button>
</Form>`;

export function FormsPage(this: Component<{}>) {
	return () => (
		<Article
			eyebrow="Build for the web"
			title="Accessible fields without hidden ownership"
			description="The forms package composes labels, help, errors, and validation while your application remains in charge of its values and submission."
			previous={{ path: '/guides/routing', label: 'Routing' }}
			next={{ path: '/guides/testing', label: 'Testing' }}
		>
			<section>
				<h2>A complete field reads in one direction</h2>
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

const testingSource = `const view = await testComponent(Counter)
  .props({ initial: 1 })
  .context(AuthContext, auth)
  .mount();

await view.root.getByRole('button', { name: 'Increment' }).click();

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
			next={{ path: '/examples/logo-lab', label: 'Logo lab' }}
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

export function LogoLabPage(this: Component<{}>) {
	return () => (
		<Article
			eyebrow="Explore · client-only"
			title="Logo lab"
			description="Edit a small Logo program and give the turtle instructions. The parser is bounded, the animation belongs to the component, and the drawing remains data rather than an opaque bitmap."
			previous={{ path: '/guides/testing', label: 'Testing' }}
			next={{ path: '/advanced', label: 'Beyond the browser' }}
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

type AdvancedCard = { /** @exact key */ title: string; text: string; packages: string };
const advancedCards: AdvancedCard[] = [
	{ title: 'SSR and hydration', text: 'Render boundary-marked HTML, then adopt it without discarding useful server work.', packages: '@exact/ssr · @exact/hydrate' },
	{ title: 'Server components', text: 'Compile client and server artifacts with manifest-allowlisted actions and refresh boundaries.', packages: '@exact/compiler · @exact/server' },
	{ title: 'Streaming', text: 'Produce document events or browser-ready progressive HTML while respecting cancellation and backpressure.', packages: '@exact/ssr' },
	{ title: 'React compatibility', text: 'Run supported React packages through compatibility runtimes and ecosystem adapters.', packages: '@exact/react-compat' },
	{ title: 'Build adapters', text: 'Use the compiler through Vite, Webpack, Bun, or the exactc precompile workflow.', packages: '@exact/vite-plugin · @exact/webpack-plugin' },
	{ title: 'Microfrontends', text: 'Describe exposures, resolve remote components, and recover boundaries through an explicit plugin.', packages: '@exact/microfrontends' }
];

export function AdvancedPage(this: Component<{}>) {
	return () => (
		<Article
			eyebrow="Explore"
			title="Beyond the browser"
			description="The browser component model is the approachable center. Around it, eXact is developing a compiler-led path through servers, streams, hydration, and other ecosystems."
			previous={{ path: '/examples/logo-lab', label: 'Logo lab' }}
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
		{ name: '@exact/core', purpose: 'Components, state ownership, context, tasks, lifecycle, and errors.' },
		{ name: '@exact/dom', purpose: 'Browser mounting, patching, events, refs, keyed reconciliation, and CSS units.' },
		{ name: '@exact/jsx', purpose: 'TypeScript JSX runtime entrypoints and namespace types.' }
	] },
	{ title: 'Add web essentials', intro: 'Common application structure without a second component model.', packages: [
		{ name: '@exact/router', purpose: 'Nested history/hash routing, links, outlets, and data operations.' },
		{ name: '@exact/forms', purpose: 'Accessible field composition and synchronous or async validation.' },
		{ name: '@exact/testing', purpose: 'Component mounting, accessible queries, events, state, and runner adapters.' }
	] },
	{ title: 'Compile and deliver', intro: 'Tools that preserve eXact semantics across build targets.', packages: [
		{ name: '@exact/compiler', purpose: 'Transforms, analysis, artifacts, manifests, sessions, and the exactc CLI.' },
		{ name: '@exact/vite-plugin', purpose: 'Vite integration over the shared compiler.' },
		{ name: '@exact/webpack-plugin', purpose: 'Webpack resolution, conditions, and transform integration.' },
		{ name: '@exact/bun-plugin', purpose: 'Bun transform and resolution hooks.' }
	] },
	{ title: 'Cross the server boundary', intro: 'Rendering and secure distributed work.', packages: [
		{ name: '@exact/ssr', purpose: 'String, document, and progressive rendering with hydration markers.' },
		{ name: '@exact/hydrate', purpose: 'DOM adoption, client operations, and safe server patch application.' },
		{ name: '@exact/server', purpose: 'Manifest-allowlisted actions and refresh handling.' }
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
