import type { Component } from '@exactjs/core';
import { CodeBlock } from '../CodeBlock.jsx';
import { Article } from './Article.jsx';
import { Callout } from './Callout.jsx';

const authoredSource = `type Product = { id: string; name: string; price: number };

interface ProductRepository {
  /** @exact shared */
  find(id: string): Promise<Product>;
}

const ProductRepositoryContext = createContext<ProductRepository>(
  'products.repository',
  { scope: 'request', reactive: false }
);

async function ProductPage(
  this: Component<{ product?: Product; saves: number }>,
  props: { productId: string }
) {
  const products = this.getContext(ProductRepositoryContext);
  this.state.saves = 0;

  // The repository makes this continuation server-only. productId is
  // captured automatically and the public result is staged into state.
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

const exchangeSource = `// Conceptual generated client transition
await invokeServerContinuation({
  operation: '<opaque generated id>',
  props: { productId: 'p-42' }
});

// Conceptual validated server result
{
  state: {
    product: { id: 'p-42', name: 'Desk', price: 499 }
  }
}

// Not present in either protocol direction:
// ProductRepository, database credentials, ApolloClient, GraphQL parser,
// TanStack Query cache, request objects, or server context values.`;

const sharedProjectionSource = `interface Database {
  // Database and its credentials stay server-only.
  /** @exact shared */
  queryProducts(category: string): Promise<ProductSummary[]>;
}

interface UnsafeDatabase {
  // Without @exact shared, returning this server-resident value to client
  // state is rejected. Secret-qualified results can never be made shared.
  queryInternalRecord(id: string): Promise<InternalRecord>;
}`;

/** Explains compiler-distributed component continuations and their data boundary. */
export function ServerExecutionPage(this: Component<{}>) {
	return () => (
		<Article
			eyebrow="Learn"
			title="One component, two cooperating state machines"
			description="Server work remains ordinary component code. The compiler separates the client and server transitions, carries only required public values, and keeps server libraries and resources out of the browser."
			previous={{ path: '/learn/async-interfaces', label: 'Suspense, Activity & scheduling' }}
			next={{ path: '/guides/routing', label: 'Routing' }}
		>
			<section>
				<h2>The useful analogy is C# async lowering</h2>
				<p>
					A C# <code>async</code> method looks linear even though the compiler creates a state
					machine whose callbacks advance execution. eXact applies the same kind of syntactic sugar
					to a split component. The durable client machine owns the live component, reactive state,
					DOM, and lifecycle. A stateless server machine executes the allowlisted server segment
					when the client asks it to advance.
				</p>
				<p>
					You write the component. The compiler creates the operation registration, captured input
					record, cancellation plumbing, response contract, state commit, and DOM update machinery.
					The generated operation identifier is deliberately opaque.
				</p>
			</section>
			<section>
				<h2>Server context stays on the server</h2>
				<CodeBlock source={authoredSource} language="tsx" title="ProductPage.tsx" />
				<p>
					The repository is created by the application&apos;s server runtime and resolved again for
					each server transition. Its use makes the awaited continuation server-only without an
					explicit placement call. It is not serialized from the browser. The product ID is a
					compiler-selected input, and the returned product is a deliberately shared, transport-safe
					result that updates component state.
				</p>
				<CodeBlock source={exchangeSource} language="ts" title="Conceptual protocol boundary" />
			</section>
			<section>
				<h2>Heavy data clients contribute zero browser runtime modules</h2>
				<p>
					If Apollo Client, TanStack Query, a database SDK, a GraphQL parser, or a schema asset is
					reachable only from server work, its entire transitive graph stays in the server build.
					The client receives plain public data and the small generated continuation stub. It does
					not need a browser copy of the server&apos;s data stack.
				</p>
				<p>
					The final client-bundle verifier checks this after bundling, including dynamic imports and
					emitted runtime assets. Private development source maps may remain complete for debugging;
					they are developer artifacts and ordinarily are not published with the application.
				</p>
			</section>
			<section>
				<h2>Shared is a narrow projection, not a change of ownership</h2>
				<CodeBlock
					source={sharedProjectionSource}
					language="ts"
					title="Server resource contracts"
				/>
				<p>
					Application and request contexts default to server residency. <code>@exact shared</code>
					on a return contract authorizes that result to cross after policy and serialization
					checks; it does not make the receiver, credentials, or other methods public. Secret
					qualification always wins and cannot be released by a shared annotation.
				</p>
			</section>
			<section>
				<h2>SSR is the first transition</h2>
				<p>
					During SSR, the server machine can resolve context, settle server tasks, and produce the
					initial HTML. It emits only the client-visible state and context needed to reconstruct the
					durable browser instance. Hydration adopts the existing DOM and arms settled work instead
					of repeating the initial query just to rediscover the same state.
				</p>
				<p>
					Later dependency changes send fresh compiler-selected snapshots to the same generated
					server continuation. Validated state and shared context results return to the client and
					flow through normal fine-grained reactivity.
				</p>
				<p>
					Reactive JSX children have stable compiler-owned marker ranges. When a server refresh
					changes one of those structures, eXact can replace that range while retaining unaffected
					siblings, component instances, and DOM state. Element, list, and property patches remain
					available, and an authoritative boundary replacement is retained as the safe fallback when
					a finer patch cannot be proven.
				</p>
			</section>
			<Callout title="Compiler errors protect the boundary">
				<p>
					Expect compilation to reject an arbitrary derived two-way value, an undeclared
					cross-runtime capture, a server resource assigned into client-visible state, a
					non-serializable result, or any attempt to release secret-qualified data. Fix the
					ownership or projection; do not work around the framework boundary in application code.
				</p>
			</Callout>
		</Article>
	);
}
