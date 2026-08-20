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
			title="One component across runtimes"
			description="Use server resources from a component while eXact keeps private code and data out of the browser."
			previous={{ path: '/learn/async-interfaces', label: 'Suspense, Activity & scheduling' }}
			next={{ path: '/learn/language-tools', label: 'Compiler-aware language tools' }}
		>
			<section>
				<h2>Use server resources in component code</h2>
				<p>
					A component may need a database, request-scoped service, secret, or server-only library
					that must never enter the browser bundle. eXact keeps the component as one authored unit
					while placing only the affected task continuation on the server.
				</p>
				<p>
					The browser owns the durable component instance, visible state, DOM, and lifecycle. For
					each server generation, the compiler sends only approved inputs to an allowlisted
					operation. The server resolves its own contexts and resources, performs the work, and
					returns only validated public results or state effects. Server objects, credentials, and
					task authority never cross the boundary.
				</p>
				<p>
					Server execution participates in the same task concepts as local work: activation,
					cancellation, dependencies, readiness, stale-generation fencing, structural children, and
					cleanup remain coordinated even though execution crosses runtimes.
				</p>
			</section>
			<section>
				<h2>Think of the split like async lowering</h2>
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
				<p>
					The browser and server share a neutral Core protocol contract. Hydration validates and
					applies those responses without taking a production dependency on the server runtime.
					Property patches cannot contain inline handlers, iframe documents, prototype controls, or
					structural DOM setters; text and HTML changes travel through dedicated operations that
					preserve framework ownership and unsafe-HTML policy.
				</p>
			</section>
			<section>
				<h2>Server context stays on the server</h2>
				<CodeBlock source={authoredSource} language="tsx" title="ProductPage.tsx" />
				<p>
					The server runtime supplies the base context for each request. The compiler sends the
					product ID and returns the shared product data to component state. The server context
					stays private.
				</p>
			</section>
			<section>
				<h2>Keep server dependencies out of the browser</h2>
				<p>
					If Apollo Client, TanStack Query, a database SDK, a GraphQL parser, or a schema asset is
					only used by server work, it stays in the server build. The browser receives plain public
					data. Build checks catch server modules that leak into browser output.
				</p>
			</section>
			<section>
				<h2>Choose what may cross the boundary</h2>
				<CodeBlock
					source={sharedProjectionSource}
					language="ts"
					title="Server resource contracts"
				/>
				<p>
					Application and request contexts stay on the server by default. <code>@exact shared</code>
					allows a return value to cross after policy and serialization checks. Secret data always
					stays private.
				</p>
			</section>
			<section>
				<h2>Server rendering uses the same work</h2>
				<p>
					During SSR, the server can resolve context and finish server tasks before sending HTML.
					Hydration adopts that HTML and restores the browser component without repeating settled
					work. Later dependency changes run the server task again and update the same component.
				</p>
			</section>
			<section>
				<h2>Keep one request lifetime</h2>
				<p>
					The composed server runtime applies context, rendering, authorization, protocol, and
					resource-limit policy from one configuration. Its request signal remains authoritative
					through rendering and operation dispatch. A narrower render signal may stop work early,
					but it cannot detach work from a disconnected request or a shutting-down runtime.
				</p>
			</section>
			<Callout title="Compiler errors protect the boundary">
				<p>
					Compilation rejects undeclared captures, non-serializable results, server resources in
					client state, and attempts to expose secrets. Follow the error message to the value that
					crossed the boundary.
				</p>
			</Callout>
		</Article>
	);
}
