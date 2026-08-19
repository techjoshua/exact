import type { Component } from '@exactjs/core';
import { Link } from '@exactjs/router';
import { CodeBlock } from '../CodeBlock.jsx';
import { Article } from './Article.jsx';
import { Callout } from './Callout.jsx';

const exactCounterSource = `
// Component state type declaration
type CounterState = { count: number };

function Counter(this: Component<CounterState>) {
  // Declares the instance default state value
  this.state.count = 0;

  // This becomes a derived reactive value automatically.
  const doubled = this.state.count * 2;

  // className composition:
  // A valueless namespaced class is unconditional
  // A truthy value controls whether the class is added.
  return () => (
    <button
      className:counter
      className:is-even={this.state.count % 2 === 0}
      onClick={() => this.state.count++}
    >
      Count: {this.state.count}; doubled: {doubled}
    </button>
  );
}`;

const reactCounterSource = `function Counter() {
  // React Hook manages state values between renders...
  // Requires hooks be executed in the same order on every
  // render... no conditional logic allowed.
  const [count, setCount] = useState(0);

  // Allocated and recalculated on every rerender...
  // even those in which nothing has changed.
  const doubled = count * 2;

  // In React you must compose all classes into a string
  return (
    <button
      className={\`counter \${count % 2 === 0 ? 'is-even' : ''}\`}
      onClick={() => setCount((value) => value + 1)}
    >
      Count: {count}; doubled: {doubled}
    </button>
  );
}`;

const exactPropsSource = `type CardProps = {
  user: User;
  theme: string;
  selected?: boolean;
  compact?: boolean;
};

function ProfileCard(this: Component<{}>, props: CardProps) {
  const user = props.user;

  // eXact composes string, array, object, and namespaced classes.
  return () => (
    <article
      className={[
        'card',
        \`theme-\${props.theme}\`,
        { selected: props.selected }
      ]}
      className:compact={props.compact}
    >
      {/* A matching local name can be punned into a prop. */}
      <Avatar {user} />
    </article>
  );
}`;

const reactPropsSource = `type CardProps = {
  user: User;
  theme: string;
  selected?: boolean;
  compact?: boolean;
};

function ProfileCard({ user, theme, selected, compact }: CardProps) {
  // React receives one className string, assembled here without a utility.
  const className = [
    'card',
    \`theme-\${theme}\`,
    selected ? 'selected' : '',
    compact ? 'compact' : ''
  ].filter(Boolean).join(' ');

  return (
    <article className={className}>
      {/* React uses the explicit prop={value} form. */}
      <Avatar user={user} />
    </article>
  );
}`;

const exactFormSource = `type ProfileState = {
  name: string;
  subscribed: boolean;
  advanced: boolean;
};

function ProfileEditor(this: Component<ProfileState>) {
  this.state.name = '';
  this.state.subscribed = false;
  this.state.advanced = false;

  // Easily create two-way reactive bindings using
  // the Value:Callback combo.
  // eXact creates the callback boilerplate for you.
  return () => (
    <form>
      <input value:onInput={this.state.name} />
      <label>
        <input
          type="checkbox"
          checked:onChange={this.state.subscribed} />
        Product updates
      </label>
      <details open:onToggle={this.state.advanced}>
        <summary>Advanced</summary>
        Hello, {this.state.name || 'friend'}.
      </details>
    </form>
  );
}`;

const reactFormSource = `function ProfileEditor() {
  // Each controlled value has its own Hook state and setter.
  const [name, setName] = useState('');
  const [subscribed, setSubscribed] = useState(false);
  const [advanced, setAdvanced] = useState(false);

  // In react you need to explicitly create each callback
  // function for each input
  return (
    <form>
      <input
        value={name}
        onInput={(event) => setName(event.currentTarget.value)}
      />
      <label>
        <input
          type="checkbox"
          checked={subscribed}
          onChange={(event) => setSubscribed(event.currentTarget.checked)}
        />
        Product updates
      </label>
      <details
        open={advanced}
        onToggle={(event) => setAdvanced(event.currentTarget.open)}>
        <summary>Advanced</summary>
        Hello, {name || 'friend'}.
      </details>
    </form>
  );
}`;

const exactListSource = `type Todo = {
  // Identity is declared once on the data model.
  /** @exact key */
  id: string;
  title: string;
  done: boolean;
};

function TodoList(this: Component<{}>, props: {
  todos: Todo[];
  onDoneChange(id: string, done: boolean): void;
}) {
  return () => (
    <ul>
      {// The compiler uses Todo.id for the 'key'.
      props.todos.map((todo) => (
        <li className:done={todo.done}>
          <label>
            <input
              type="checkbox"
              checked={todo.done}
              onChange={(event) => 
                props.onDoneChange(todo.id, event.currentTarget.checked)
              }
            />
            {todo.title}
          </label>
        </li>
      ))}
    </ul>
  );
}`;

const reactListSource = `type Todo = {
  id: string;
  title: string;
  done: boolean
};

function TodoList(props: {
  todos: Todo[];
  onDoneChange(id: string, done: boolean): void;
}) {
  return (
    <ul>
      {// React list identity must be supplied
       // at this JSX use site.
      props.todos.map((todo) => (  
        <li
          key={todo.id}
          className={todo.done ? 'done' : undefined}
        >
          <label>
            <input
              type="checkbox"
              checked={todo.done}
              onChange={(event) =>
                props.onDoneChange(todo.id, event.currentTarget.checked)
              }
            />
            {todo.title}
          </label>
        </li>
      ))}
    </ul>
  );
}`;

const exactSearchSource = `type SearchState = { query: string; results: Result[] };

function Search(this: Component<SearchState>) {
  this.state.query = '';
  this.state.results = [];

  async function load(
    query: string,
    task: TaskContext = TaskContext.client().latest()
  ) {
    // The compiler passes the generation signal to this cancellable API.
    // latest() also fences writes from superseded generations.
    this.state.results = await search(query);
  }

  // This setup argument makes query a compiler-observed task dependency.
  load(this.state.query);

  return () => (
    <section aria-busy={load.pending}>
      <input type="search" value:onInput={this.state.query} />
      <ResultList results={this.state.results} />
    </section>
  );
}`;

const reactSearchSource = `function Search() {
  // Status and results are modeled as separate Hook state.
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Result[]>([]);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    // The Effect owns cancellation for the request started by this query.
    const controller = new AbortController();

    async function load() {
      setPending(true);
      try {
        setResults(await search(query, { signal: controller.signal }));
      } catch (error) {
        if (!controller.signal.aborted) throw error;
      } finally {
        if (!controller.signal.aborted) setPending(false);
      }
    }

    void load();

    return () => controller.abort();
    // React reruns the Effect when this authored dependency changes.
  }, [query]);

  return (
    <section aria-busy={pending}>
      <input
        type="search"
        value={query}
        onInput={(event) => setQuery(event.currentTarget.value)}
      />
      <ResultList results={results} />
    </section>
  );
}`;

const exactProductDataSource = `// product-data.ts
import { createContext } from '@exactjs/core';

export type Product = {
  /** @exact key */
  id: string;
  name: string;
  category: string;
  saved: boolean;
};

// Each @exact shared method authorizes only its plain result to cross.
export interface ProductRepository {
  /** @exact shared */
  find(id: string): Promise<Product>;

  /** @exact shared */
  related(category: string): Promise<Product[]>;

  /** @exact shared */
  setSaved(id: string, saved: boolean): Promise<boolean>;
}

export const Products = createContext<ProductRepository>('products', {
  // The implementation is supplied by the server for each request.
  scope: 'request',
  reactive: false
});`;

const exactProductPageSource = `// ProductPage.tsx
import type { Component } from '@exactjs/core';
import { Products, type Product } from './product-data';
import { SaveProduct } from './SaveProduct';

export async function ProductPage(
  this: Component<{ product: Product }>,
  props: { productId: string }
) {
  const products = this.getContext(Products);

  // Server context places this continuation. The compiler captures
  // productId and stages the public result into component state.
  this.state.product = await products.find(props.productId);

  return () => (
    <article>
      <h1>{this.state.product.name}</h1>
      <SaveProduct product={this.state.product} />
      <Recommendations category={this.state.product.category} />
    </article>
  );
}

async function Recommendations(
  this: Component<{ products: Product[] }>,
  props: { category: string }
) {
  // This component resolves its own server repository. ProductPage passes
  // only the category, not fetched recommendations or data-access plumbing.
  const products = this.getContext(Products);
  this.state.products = await products.related(props.category);

  return () => (
    <ul>
      {this.state.products.map((product) => <li>{product.name}</li>)}
    </ul>
  );
}`;

const exactSaveProductSource = `// SaveProduct.tsx
import { TaskContext, type Component } from '@exactjs/core';
import { Products, type Product } from './product-data';

export function SaveProduct(
  this: Component<{ saved: boolean }>,
  props: { product: Product }
) {
  const products = this.getContext(Products);
  this.state.saved = props.product.saved;

  async function toggle(
    task: TaskContext = TaskContext.server().latest()
  ) {
    const next = !this.state.saved;

    // Show the next value now. eXact removes this generation-owned overlay
    // automatically if the server task fails, cancels, or is superseded.
    task.optimistic(() => {
      this.state.saved = next;
    });

    // The generated continuation carries cancellation across the endpoint.
    this.state.saved = await products.setSaved(props.product.id, next);
  }

  return () => (
    <button disabled={toggle.pending} onClick={() => toggle()}>
      {this.state.saved ? 'Saved' : 'Save product'}
    </button>
  );
}`;

const reactProductDataSource = `// app/products/product-data.ts
import 'server-only';
import { db } from '@/server/database';

export type Product = {
  id: string;
  name: string;
  category: string;
  saved: boolean;
};

export interface ProductRepository {
  find(id: string): Promise<Product>;
  related(category: string): Promise<Product[]>;
  setSaved(id: string, saved: boolean): Promise<boolean>;
}

// server-only keeps this adapter and its database import out of Client Components.
export const products: ProductRepository = {
  find: (id) => db.products.find(id),
  related: (category) => db.products.related(category),
  setSaved: (id, saved) => db.products.setSaved(id, saved)
};`;

const reactProductPageSource = `// app/products/[id]/page.tsx — React Server Components via Next.js
import { revalidatePath } from 'next/cache';
import { products } from '../product-data';
import { SaveProduct } from './SaveProduct';

export default async function ProductPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // This Server Component imports its server-only repository. The route
  // supplies only the product id, not database or transport plumbing.
  const product = await products.find(id);

  async function setSaved(saved: boolean) {
    'use server';
    const authoritative = await products.setSaved(product.id, saved);
    revalidatePath(\`/products/\${product.id}\`);
    return authoritative;
  }

  return (
    <article>
      <h1>{product.name}</h1>
      <SaveProduct saved={product.saved} setSaved={setSaved} />
      <Recommendations category={product.category} />
    </article>
  );
}

async function Recommendations({ category }: { category: string }) {
  // This Server Component imports its own server repository. ProductPage
  // passes only the category, not fetched recommendations or data access.
  const related = await products.related(category);

  return (
    <ul>
      {related.map((product) => <li key={product.id}>{product.name}</li>)}
    </ul>
  );
}`;

const reactSaveProductSource = `// app/products/[id]/SaveProduct.tsx
'use client';

import { useOptimistic } from 'react';
import { useFormStatus } from 'react-dom';

export function SaveProduct(props: {
  saved: boolean;
  setSaved(saved: boolean): Promise<boolean>;
}) {
  // React owns this optimistic value until the form Action settles and the
  // refreshed Server Component payload supplies the authoritative prop.
  const [saved, setOptimisticSaved] = useOptimistic(props.saved);

  return (
    <form action={async () => {
      const next = !saved;
      setOptimisticSaved(next);
      const authoritative = await props.setSaved(next);
      setOptimisticSaved(authoritative);
    }}>
      <SubmitButton saved={saved} />
    </form>
  );
}

function SubmitButton({ saved }: { saved: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button disabled={pending}>
      {saved ? 'Saved' : 'Save product'}
    </button>
  );
}`;

const exactLifecycleSource = `function OnlineBadge(this: Component<{ online: boolean }>) {
  this.state.online = navigator.onLine;
  const update = () => this.state.online = navigator.onLine;

  // The compiler owns these setup-created listeners and injects their
  // component-lifetime signal. No authored cleanup pair is needed.
  window.addEventListener('online', update);
  window.addEventListener('offline', update);

  return () => (
    <output className:online={this.state.online}>
      {this.state.online ? 'Online' : 'Offline'}
    </output>
  );
}`;

const reactLifecycleSource = `function OnlineBadge() {
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);

    // The Effect returns the matching component-lifetime cleanup.
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  return (
    <output className={online ? 'online' : undefined}>
      {online ? 'Online' : 'Offline'}
    </output>
  );
}`;

/** Introduces native eXact component authoring through paired, idiomatic React examples. */
export function ReactDevelopersPage(this: Component<{}>) {
	return () => (
		<Article
			eyebrow="Migration guide"
			title="eXact for React developers"
			description="The TSX looks familiar, but the component model is different. Compare everyday components side by side and see which React habits translate directly, which disappear, and which become compiler-owned."
			previous={{ path: '/getting-started', label: 'Quick start' }}
			next={{ path: '/learn/components', label: 'Components' }}
		>
			<section>
				<h2>Keep the JSX; change the mental model</h2>
				<p>
					A React function executes again after an update, so Hooks preserve state and effects
					across executions and React reconciles the next tree. An eXact component is one durable,
					inspectable instance generated by the compiler. The authored component supplies the
					compiler with state defaults, reactive relationships, tasks, lifecycle intent, and a view
					description. The authored function neither executes as a setup callback nor reruns to
					produce updates; the generated state machine owns runtime behavior.
				</p>
				<div theme:surface="raised" className="definition-grid">
					<code>useState()</code>
					<p>
						Use fields on the instance-owned <code>this.state</code> object.
					</p>
					<code>useMemo()</code>
					<p>Write an ordinary derived expression; the compiler keeps it reactive and shared.</p>
					<code>useEffect()</code>
					<p>
						Use lifecycle registration for mounted resources or a function task for coordinated
						work.
					</p>
					<code>setState(next)</code>
					<p>
						Mutate the relevant state field, object, array, <code>Map</code>, or <code>Set</code>{' '}
						directly.
					</p>
				</div>
			</section>

			<section className="react-comparison">
				<h2>Local state, events, and derived values</h2>
				<p>
					Both versions express the same counter. React executes the component again to calculate
					<code>doubled</code> and the next class string. eXact initializes <code>count</code> once
					per instance, turns the ordinary <code>doubled</code> expression into a derived value, and
					patches only consumers of the changed field. A valueless namespaced class contributes its
					token unconditionally; a namespaced class with a value contributes it only when that value
					is truthy.
				</p>
				<div className="code-comparison">
					<CodeBlock source={exactCounterSource} language="tsx" title="eXact" />
					<CodeBlock source={reactCounterSource} language="tsx" title="React" />
				</div>
			</section>

			<section className="react-comparison">
				<h2>Controlled form fields</h2>
				<p>
					React repeats each value path in a prop and an event handler. eXact&apos;s finite
					<code>property:event</code> JSX syntax generates that same projection and write-back
					relationship. It also converts number, date, checkbox, radio, multi-select, details, and
					dialog values according to the control and state type. Use explicit handlers whenever the
					update must validate, transform, log, await, or reject a value.
				</p>
				<div className="code-comparison">
					<CodeBlock source={exactFormSource} language="tsx" title="eXact" />
					<CodeBlock source={reactFormSource} language="tsx" title="React" />
				</div>
			</section>

			<section className="react-comparison">
				<h2>Props and class composition</h2>
				<p>
					Both frameworks pass ordinary props. eXact additionally allows a matching variable name to
					be punned as <code>{'<Avatar {user} />'}</code>. Its <code>className</code> accepts nested
					string, array, and object contributions, while <code>className:compact</code> adds one
					statically known token. React commonly builds the final string in application code or uses
					a class-name utility.
				</p>
				<div className="code-comparison">
					<CodeBlock source={exactPropsSource} language="tsx" title="eXact" />
					<CodeBlock source={reactPropsSource} language="tsx" title="React" />
				</div>
			</section>

			<section className="react-comparison">
				<h2>Keyed lists and parent-owned props</h2>
				<p>
					Both lists receive parent-owned items and report edits through the same{' '}
					<code>onDoneChange</code> callback. eXact tracks prop reads reactively, including nested
					plain objects and collections, but keeps those inputs readonly in the child; its two-way
					binding shorthand requires a writable component-state location. React also supplies
					identity at each JSX use with <code>key</code>; eXact declares identity once on the data
					model, so its JSX-producing <code>map()</code> does not repeat the key prop.
				</p>
				<div className="code-comparison">
					<CodeBlock source={exactListSource} language="tsx" title="eXact" />
					<CodeBlock source={reactListSource} language="tsx" title="React" />
				</div>
			</section>

			<section className="react-comparison">
				<h2>Reactive async work</h2>
				<p>
					The React effect manually declares a dependency list, loading state, cancellation, and
					publication callbacks. In eXact, the setup call connects <code>query</code> to a named
					task. The compiler passes the generation signal to a recognized cancellable API, so the
					authored call does not thread an <code>AbortSignal</code> through its options.{' '}
					<code>latest()</code> supersedes an older invocation, stale writes are fenced, and the
					function exposes reactive status such as
					<code>load.pending</code>. Tasks are the right step up when work needs status,
					cancellation, concurrency, scheduling, optimistic state, or client/server placement.
				</p>
				<div className="code-comparison">
					<CodeBlock source={exactSearchSource} language="tsx" title="eXact" />
					<CodeBlock source={reactSearchSource} language="tsx" title="React" />
				</div>
			</section>

			<section className="react-comparison">
				<h2>One interactive screen across client and server</h2>
				<p>
					This larger example loads a product and recommendations on the server, renders an
					interactive save control in the browser, performs its mutation on the server, shows an
					optimistic result, and reconciles the authoritative response. The React side uses the
					Next.js App Router because React Server Components define a component protocol, not a
					complete application transport or cache-invalidation system.
				</p>
				<p>
					Both sides use the same <code>Product</code> model and
					<code>ProductRepository</code> API. On the eXact side,
					<code>task.optimistic()</code> publishes its synchronous state writes immediately as an
					overlay owned by that task generation. Failure, cancellation, or supersession removes the
					overlay automatically; the returned repository value remains authoritative.
				</p>
				<div className="code-comparison">
					<div className="comparison-code-stack">
						<h3>eXact: one compiled component graph</h3>
						<CodeBlock source={exactProductDataSource} language="tsx" title="product-data.ts" />
						<CodeBlock source={exactProductPageSource} language="tsx" title="ProductPage.tsx" />
						<CodeBlock source={exactSaveProductSource} language="tsx" title="SaveProduct.tsx" />
					</div>
					<div className="comparison-code-stack">
						<h3>React: server and client component modules</h3>
						<CodeBlock
							source={reactProductDataSource}
							language="tsx"
							title="product-data.ts — server"
						/>
						<CodeBlock source={reactProductPageSource} language="tsx" title="page.tsx — server" />
						<CodeBlock
							source={reactSaveProductSource}
							language="tsx"
							title="SaveProduct.tsx — client"
						/>
					</div>
				</div>
				<div
					theme:surface="raised"
					className="continuation-comparison"
					aria-label="Client and server flow comparison"
				>
					<div>
						<strong>Initial request</strong>
						<p>
							eXact settles blocking continuations during SSR, then hydration adopts the HTML and
							reconstructs durable browser instances from public state. React renders the Server
							Component result and hydrates its Client Component boundaries; Server Components do
							not run in the browser.
						</p>
					</div>
					<div>
						<strong>Interaction</strong>
						<p>
							Both serialize framework-selected operation identity and public inputs into an
							endpoint request. eXact dispatches the task&apos;s allowlisted continuation; Next.js
							invokes the Server Function referenced by the form Action.
						</p>
					</div>
					<div>
						<strong>Authoritative update</strong>
						<p>
							Both return serializable authoritative output. eXact validates state effects and
							updates their precise consumers. Next.js revalidates the route, reruns its Server
							Components, and merges the resulting RSC payload.
						</p>
					</div>
				</div>
				<Callout title="What actually differs" tone="note">
					<p>
						Both versions keep the repository implementation on the server, and both invoke server
						work through serialized requests. What differs is the unit you author. In eXact,
						<code>ProductPage</code>, <code>Recommendations</code>, and <code>SaveProduct</code>{' '}
						remain native components in one compiler-analyzed graph; the compiler separates only the
						server-dependent continuations and reconnects their results to browser-owned state. In
						React with Next.js, <code>ProductPage</code> and <code>Recommendations</code> are
						server-only components, <code>SaveProduct</code> is a Client Component, and{' '}
						<code>setSaved</code> is a Server Function. Neither design eliminates the network
						boundary—they organize component ownership and updates differently around it.
					</p>
				</Callout>
				<Link theme:action="secondary" className="secondary-link" to="/learn/server-execution">
					Follow the generated continuation boundary
				</Link>
			</section>

			<section className="react-comparison">
				<h2>Mounted resources and cleanup</h2>
				<p>
					React&apos;s effect returns an unsubscription callback. eXact recognizes the setup-created
					browser listeners, lowers them into component-owned client work, and injects the lifetime
					signal into the generated listener options. The authored source therefore needs neither an
					<code>AbortSignal</code> nor matching <code>removeEventListener()</code> calls. Use
					explicit lifecycle registration when the timing itself matters, and task cleanup for
					opaque resources.
				</p>
				<div className="code-comparison">
					<CodeBlock source={exactLifecycleSource} language="tsx" title="eXact" />
					<CodeBlock source={reactLifecycleSource} language="tsx" title="React" />
				</div>
			</section>

			<Callout title="Use React components where they help" tone="note">
				<p>
					These examples show native eXact authoring. The optional compatibility boundary lets
					applications keep supported React 18 and 19 components with their React semantics intact.
				</p>
			</Callout>

			<section>
				<h2>Where to go next</h2>
				<p>
					Start with components and state to learn the durable-instance model, then use the focused
					guides when a comparison introduces a feature you need.
				</p>
				<div className="hero-actions">
					<Link theme:action="primary" className="primary-link" to="/learn/components">
						Learn native components
					</Link>
					<Link
						theme:action="secondary"
						className="secondary-link"
						to="/guides/react-compatibility"
					>
						Keep existing React components
					</Link>
				</div>
			</section>
		</Article>
	);
}
