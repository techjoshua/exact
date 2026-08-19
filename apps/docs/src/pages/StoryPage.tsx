import type { Component } from '@exactjs/core';
import { Link } from '@exactjs/router';
import { CodeBlock } from '../CodeBlock.jsx';
import { Article } from './Article.jsx';
import { Callout } from './Callout.jsx';

const asyncSource = `async function loadProfile(id: string) {
  try {
    const response = await fetch(\`/api/profiles/\${id}\`);
    return await response.json();
  } catch (error) {
    reportError(error);
    throw error;
  }
}`;

const csharpIteratorSource = `static IEnumerable<Task> LoadProfile(string id, AsyncResult<Profile> output)
{
    Task<HttpResponseMessage> response = client.GetAsync($"/api/profiles/{id}");
    yield return response;

    response.Result.EnsureSuccessStatusCode();

    Task<string> json = response.Result.Content.ReadAsStringAsync();
    yield return json;

    output.Value = JsonSerializer.Deserialize<Profile>(json.Result);
}

// The runner awaits Current, then calls MoveNext() again.
// AsyncResult<T> carries the typed result out of the iterator.`;

const javascriptGeneratorSource = `function* loadProfile(id: string) {
  try {
    const response = yield fetch(\`/api/profiles/\${id}\`);
    return yield response.json();
  } catch (error) {
    reportError(error);
    throw error;
  }
}

// A runner repeatedly calls iterator.next(value) or iterator.throw(error).
// The iterator keeps the suspended locals and the next place to resume.`;

const exactCounterSource = `import type { Component } from '@exactjs/core';

function Counter(this: Component<{ count: number }>) {
  // Default state for each new component instance.
  this.state.count = 0;
  const doubled = this.state.count * 2;

  return () => (
    <button onClick={() => this.state.count++}>
      Count: {this.state.count}; doubled: {doubled}
    </button>
  );
}`;

const reactCounterSource = `function Counter() {
  const [count, setCount] = useState(0);
  const doubled = count * 2;

  return (
    <button onClick={() => setCount((value) => value + 1)}>
      Count: {count}; doubled: {doubled}
    </button>
  );
}`;

const distributedSource = `type Product = { id: string; name: string };
type ProductState = { product?: Product; saves: number };

interface ProductRepository {
  /** @exact shared */
  find(id: string): Promise<Product>;
}

async function ProductPage(this: Component<ProductState>, props: { productId: string }) {
  const products = this.getContext(ProductRepositoryContext);
  this.state.saves = 0;

  // The server-resident repository determines placement. The compiler
  // transports productId and stages the public result into component state.
  this.state.product = await products.find(props.productId);

  return () => (
    <article>
      <h1>{this.state.product?.name}</h1>
      <button onClick={() => this.state.saves++}>
        Saved {this.state.saves} times
      </button>
    </article>
  );
}`;

const reactCompatibilitySource = `import { DatePicker } from 'react-date-picker';

function BookingForm(this: Component<{ date: Date | null }>) {
  this.state.date = null;

  return () => (
    <section>
      <DatePicker
        value={this.state.date}
        onChange={(date) => (this.state.date = date)}
      />
      <p>Selected: {this.state.date?.toLocaleDateString() ?? 'none'}</p>
    </section>
  );
}`;

/** Tells the personal and technical story behind eXact's compiler-led component model. */
export function StoryPage(this: Component<{}>) {
	return () => (
		<Article
			eyebrow="The story behind eXact"
			title="From async/await to eXact"
			description="A compiler can turn clear source code into the sophisticated machinery needed to run it. That idea led from async/await to eXact."
			previous={{ path: '/', label: 'Introduction' }}
			next={{ path: '/getting-started', label: 'Quick start' }}
		>
			<section>
				<h2>Async code became readable</h2>
				<p>
					I remember when <code>async</code>/<code>await</code> arrived in JavaScript. My coworkers
					were in awe of how naturally it expressed complicated asynchronous work. There were no
					callbacks to nest and no visible chains of <code>.then()</code> and <code>.catch()</code>.
					The code read from top to bottom, almost like an ordinary synchronous function.
				</p>
				<CodeBlock source={asyncSource} language="ts" title="Readable asynchronous control flow" />
				<p>To them, it felt like magic. To me, it felt familiar.</p>
				<p>
					My background was in C#, starting with .NET 1.0. When C# async support was previewed for
					.NET 4.5, I was excited for the same reason. My work was still on .NET 4, so I could not
					use it yet, but I read everything I could find from Eric Lippert, Mads Torgersen, and
					Stephen Toub. The syntax mattered less than what the compiler could make it mean.
				</p>
			</section>

			<section>
				<h2>Compilers can hide complex machinery</h2>
				<p>
					C# lowers an async method into a resumable state machine. It preserves local data between
					steps, records where execution should continue, and advances the method when awaited work
					settles. That design is closely related to iterator lowering, and .NET 4 already had
					iterators. That gave me an idea.
				</p>
				<p>
					After several trips down the rabbit hole, I built a small package that expressed
					asynchronous operations with iterator blocks. I had to write <code>yield return</code>
					instead of <code>await</code>, but an iterator runner could feed each completed result
					back into the suspended function. Extension methods wrapped the runner and preserved typed
					results with generics.
				</p>
				<CodeBlock
					source={csharpIteratorSource}
					language="csharp"
					title="The iterator-shaped C# experiment"
				/>
				<p>
					It was a toy, but it taught me something durable: a programmer can write the clearest
					version of an idea while the compiler generates the bookkeeping. The transformed program
					may contain states, continuations, and careful error handling while the authored program
					stays clear.
				</p>
			</section>

			<section>
				<h2>JavaScript adopted the same idea</h2>
				<p>
					JavaScript standardized generators before <code>async</code>/<code>await</code>. During
					the long period when browser support varied, tools such as Babel and TypeScript could
					lower newer syntax into generator-like or explicit state-machine code for older targets.
					Modern engines support async functions directly and may optimize them in different ways;
					the language specification defines their observable behavior while engines choose the
					implementation.
				</p>
				<CodeBlock
					source={javascriptGeneratorSource}
					language="ts"
					title="A generator-shaped JavaScript lowering"
				/>
				<p>
					That distinction matters. Compilation gives us the freedom to separate an expressive
					source model from the detailed mechanism that makes it work.
				</p>
			</section>

			<section>
				<h2>Applying the lesson to components</h2>
				<p>
					React proved that components and declarative views could transform web development. Its
					modern function components are concise and composable, and Hooks make state, effects, and
					other React services available from a function. The tradeoff is that the function runs
					again to describe the interface after an update. Hook identity therefore depends on a
					stable call order, and React reconciles the new description with the previous tree before
					committing DOM changes.
				</p>
				<CodeBlock source={reactCounterSource} language="tsx" title="A React counter" />
				<p>
					That is a deliberate architecture. Repeated component execution shapes how state,
					effects, closures, identity, and
					memoization must be handled, and Hooks must be called in the same order on every render.
				</p>
				<p>
					Every framework makes tradeoffs as it balances its goals against reality. Some achieve
					fine-grained runtime reactivity through proxies; primitive values may require wrapper
					objects and explicit unwrapping in JavaScript or TypeScript. Others rely on
					compiler-recognized templates or reactive syntax. Each chooses its own balance of syntax,
					runtime behavior, and compiler knowledge.
				</p>
				<p>
					I wanted a particular combination: familiar TypeScript and TSX, a durable and inspectable
					component instance, direct mutable state, precise reactive work, and a compiler that could
					understand the client/server boundary. That combination became eXact.
				</p>
			</section>

			<section>
				<h2>Define once, update precisely</h2>
				<p>
					In eXact, the compiler treats the component body as a definition of initial state, tasks,
					reactive relationships, and view preparation. The compiler turns that description into a
					reactive state machine, and each mounted component
					owns one durable instance. Every state read connects to the DOM expression, derived value,
					task, or server operation that consumes it.
				</p>
				<CodeBlock source={exactCounterSource} language="tsx" title="The same idea in eXact" />
				<p>
					When <code>count</code> changes, the existing state machine transitions and there is no
					virtual tree to diff. The count text and the derived value are invalidated as precise
					reactive expressions. The runtime updates the affected DOM ranges while the component, its
					state, its tasks, and its owned resources remain in place.
				</p>
				<Callout title="How the pieces fit" tone="note">
					<p>
						eXact uses the right compiled representation for each kind of work. Synchronous state
						reads become a graph of targeted reactive updates, while async initialization and
						distributed server work become resumable continuations. In both cases, the compiler
						manages complexity that would otherwise spill into component code.
					</p>
				</Callout>
			</section>

			<section>
				<h2>One component can cross the network</h2>
				<p>
					Client rendering alone would make a fine-grained compiler interesting, but modern
					frameworks also need server rendering, hydration, cancellation, and safe server work.
					eXact treats those as parts of the same component model.
				</p>
				<CodeBlock source={distributedSource} language="tsx" title="ProductPage.tsx" />
				<p>
					The compiler analyzes what each operation reaches. A browser global implies client
					placement; a server-only import or server-resident context implies server placement.
					Explicit placement is available when intent cannot be proven. In this example, the
					request-scoped repository stays on the server while its deliberately shared product result
					can enter client-visible state.
				</p>
				<p>
					The build produces cooperating client and server artifacts. During SSR, server work can
					settle before HTML is sent. Hydration adopts that HTML and restores the browser-owned
					instance without repeating settled work. A later server transition sends only the
					compiler-selected props, captures, and dependency values required by an allowlisted,
					opaque operation. The server resolves trusted resources again, validates the activation
					record, stages permitted writes, and returns a transport-safe result.
				</p>
				<p>
					The compiler and server runtime provide the endpoint and protocol for each continuation.
					They own operation IDs,
					allowlisting, serialization checks, cancellation, state publication, and the connection
					back to reactive UI work.
				</p>
			</section>

			<section>
				<h2>Server placement shapes the browser bundle</h2>
				<p>
					A database SDK, GraphQL parser, Apollo Client instance, or TanStack Query cache used only
					by server work stays in the server artifact. eXact&apos;s compiler plans that separation, and
					its bundler integrations verify the final client graph. The browser receives public data
					and a small generated continuation contract. Server data clients and credentials remain on
					the server.
				</p>
				<p>
					The same ownership model improves debugging. An eXact component is a real, long-lived
					object whose state, tasks, contexts, resources, and lifecycle can be inspected. Tests
					should prefer stable public behavior, because implementation-coupled tests are expensive
					to maintain. Inspectability still matters when debugging a failed invariant, checking
					cleanup, or understanding why a transition produced the wrong behavior.
				</p>
			</section>

			<section>
				<h2>React compatibility supports gradual adoption</h2>
				<p>
					React changed how the industry builds interfaces and supports a vast ecosystem. eXact&apos;s
					optional compatibility layer lets applications use supported React 18 and 19 components.
				</p>
				<CodeBlock
					source={reactCompatibilitySource}
					language="tsx"
					title="A React component inside native eXact JSX"
				/>
				<p>
					With compatibility enabled, the compiler inserts the ownership boundary. React components
					retain React semantics internally while their reactive inputs can come from eXact state.
					Mixed trees, context bridges, SSR, hydration, Hooks, class components, refs, Suspense, and
					portals are supported within the documented compatibility boundary. Packages that depend
					on private Fiber or host-renderer behavior may still be rejected. Native eXact components
					continue to use eXact&apos;s component and server model.
				</p>
				<p>
					The goal is straightforward: make eXact the framework people want to build with, while
					giving existing applications a practical path to get there. We are still at the beginning,
					but the direction is the same one that fascinated me years ago: write the clearest version
					of the program, then let the compiler manage the machinery.
				</p>
				<div className="hero-actions">
					<Link theme:action="primary" className="primary-link" to="/getting-started">
						Build your first eXact app <span aria-hidden="true">{'->'}</span>
					</Link>
					<Link theme:action="secondary" className="secondary-link" to="/learn/compiler-tour">
						See what the compiler generates
					</Link>
				</div>
			</section>
		</Article>
	);
}
