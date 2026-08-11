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

const csharpIteratorSource = `static IEnumerable<Task> LoadProfile(
    string id,
    AsyncResult<Profile> output)
{
    Task<HttpResponseMessage> response =
        client.GetAsync($"/api/profiles/{id}");
    yield return response;

    response.Result.EnsureSuccessStatusCode();

    Task<string> json =
        response.Result.Content.ReadAsStringAsync();
    yield return json;

    output.Value =
        JsonSerializer.Deserialize<Profile>(json.Result);
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

interface ProductRepository {
  /** @exact shared */
  find(id: string): Promise<Product>;
}

async function ProductPage(
  this: Component<{ product?: Product; saves: number }>,
  props: { productId: string }
) {
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
			title="What async/await taught me about web frameworks"
			description="Clear source code and sophisticated runtime machinery do not have to be enemies. Sometimes the compiler can carry the complexity so the programmer does not have to."
			previous={{ path: '/', label: 'Introduction' }}
			next={{ path: '/getting-started', label: 'Quick start' }}
		>
			<section>
				<h2>When asynchronous code started reading like ordinary code</h2>
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
					Stephen Toub. The important lesson was not merely how to spell <code>await</code>. It was
					what a compiler could make that spelling mean.
				</p>
			</section>

			<section>
				<h2>The machinery can be stranger than the source</h2>
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
					may contain states, continuations, and careful error handling; the authored program does
					not need to advertise all of that machinery.
				</p>
			</section>

			<section>
				<h2>JavaScript completed the circle</h2>
				<p>
					JavaScript standardized generators before <code>async</code>/<code>await</code>. During
					the long period when browser support varied, tools such as Babel and TypeScript could
					lower newer syntax into generator-like or explicit state-machine code for older targets.
					Modern engines support async functions directly and may optimize them in different ways;
					the language specification defines their observable behavior, not one mandatory internal
					implementation.
				</p>
				<CodeBlock
					source={javascriptGeneratorSource}
					language="ts"
					title="A generator-shaped JavaScript lowering"
				/>
				<p>
					That distinction matters. The gift of compilation is not a particular <code>switch</code>
					statement hidden in generated output. It is the freedom to separate an expressive source
					model from the detailed mechanism that makes the model work.
				</p>
			</section>

			<section>
				<h2>Then I looked at components</h2>
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
					That is a coherent architecture, not an accident. It also puts your code in a box:
					repeated component execution shapes how state, effects, closures, identity, and
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
				<h2>Describe once... update only what depends on state</h2>
				<p>
					In eXact, the outer component function is a compiler-analyzed definition of initial state,
					tasks, reactive relationships, and view preparation—not a callback executed linearly. The
					compiler turns that description into a reactive state machine, and each mounted component
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
				<Callout title="Where the state-machine analogy fits" tone="note">
					<p>
						It is useful, but it is not the whole architecture. eXact compiles synchronous reads
						into a graph of targeted reactive work. Async initialization and distributed server work
						are lowered into resumable continuations. Together they provide the same larger lesson
						as async/await: generated complexity can protect simple, linear source.
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
					The component author does not hand-build an endpoint for each continuation or reproduce
					the protocol in application code. The compiler and server runtime own operation IDs,
					allowlisting, serialization checks, cancellation, state publication, and the connection
					back to reactive UI work.
				</p>
			</section>

			<section>
				<h2>The split is also a bundle boundary</h2>
				<p>
					A database SDK, GraphQL parser, Apollo Client instance, or TanStack Query cache used only
					by server work does not belong in the browser artifact. eXact&apos;s compiler plans that
					separation, and its bundler integrations can verify the final client graph so server-only
					modules do not leak into runtime chunks or assets. The browser receives public data and a
					small generated continuation contract—not the server&apos;s data stack or credentials.
				</p>
				<p>
					The same ownership model improves diagnostics. An eXact component is a real, long-lived
					object whose state, tasks, contexts, resources, and lifecycle can be inspected. Tests
					should prefer stable public behavior, because implementation-coupled tests are expensive
					to maintain. But inspectability still matters when debugging a failed invariant, checking
					cleanup, or understanding why a transition produced the wrong behavior.
				</p>
			</section>

			<section>
				<h2>React is a bridge, not the blueprint</h2>
				<p>
					None of this diminishes React&apos;s contribution. React changed how the industry thinks
					about interface composition and built an ecosystem that a new framework should not ask
					people to abandon overnight. eXact therefore includes an optional compatibility layer for
					supported React 18 and 19 components.
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
					on private Fiber or host-renderer behavior may still be rejected, and React Server
					Components are not the architecture eXact is trying to reproduce.
				</p>
				<p>
					The goal is straightforward: make eXact the framework people want to build with, while
					giving existing applications a practical path to get there. We are still at the beginning,
					but the direction is the same one that fascinated me years ago: write the clearest version
					of the program, then let the compiler carry the machinery.
				</p>
				<div className="hero-actions">
					<Link className="primary-link" to="/getting-started">
						Build your first eXact app <span aria-hidden="true">{'->'}</span>
					</Link>
					<Link className="secondary-link" to="/learn/compiler-tour">
						See what the compiler generates
					</Link>
				</div>
			</section>
		</Article>
	);
}
