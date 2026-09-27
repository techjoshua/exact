import type { Component } from '@exactjs/core';
import { CodeBlock } from '../CodeBlock.jsx';
import { Article } from './Article.jsx';
import { Callout } from './Callout.jsx';

const authoredSource = `import { createContext, type Component } from '@exactjs/core';

export type Product = { id: string; name: string; price: number };

interface ProductRepository {
  /** @exact shared */
  find(id: string): Promise<Product>;
}

export const ProductRepositoryContext = createContext<ProductRepository>(
  'products.repository',
  { scope: 'request', reactive: false }
);

export async function ProductPage(
  this: Component<{ product?: Product; detailsOpen: boolean }>,
  props: { productId: string }
) {
  const products = this.getContext(ProductRepositoryContext);
  this.state.detailsOpen = false;

  // The repository makes this continuation server-only. productId is
  // captured automatically and the public result is staged into state.
  this.state.product = await products.find(props.productId);

  return () => (
    <article>
      <h1>{this.state.product?.name}</h1>
      <button onClick={() => this.state.detailsOpen = !this.state.detailsOpen}>
        {this.state.detailsOpen ? 'Hide details' : 'Show details'}
      </button>
      {this.state.detailsOpen && <p>Product ID: {this.state.product?.id}</p>}
    </article>
  );
}`;

const requestContextSource = `import { composeExactExecutorContract } from '@exactjs/server';
import { createExactServerRuntime } from '@exactjs/ssr';
import {
  ProductPage, ProductRepositoryContext
} from '../.exact/ProductPage.exact.server.js';

// Compose the operations emitted for this server component.
const contract = composeExactExecutorContract([ProductPage], { endpoint: '/__exact' });

const runtime = createExactServerRuntime({
  contract,
  requestContexts: async ({ platformRequest }) => [
    [ProductRepositoryContext, {
      value: await repositoryForVerifiedRequest(platformRequest)
    }]
  ]
});`;

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
			previous={{ path: '/learn/component-registries', label: 'Dynamic components' }}
			next={{ path: '/guides/routing', label: 'Routing' }}
		>
			<section>
				<h2>Call a server resource from the component</h2>
				<p>
					A product page needs database records, but its browser code cannot hold database
					credentials. You would usually add an endpoint, define its response, and write client code
					to fetch it. Keeping those pieces in sync adds work whenever the feature changes.
				</p>
				<p>
					In eXact, write the operation as an ordinary call. The compiler turns the part that needs
					server resources into a <strong>continuation</strong>: work the server executes for the
					component. It generates the communication and returns the permitted result to component
					state. You can read the feature’s data flow in one place.
				</p>
				<p>
					This example reads a product through a repository supplied by the server. A
					<strong>context</strong> gives the component access to that service without passing the
					repository or its credentials through browser props.
				</p>
				<CodeBlock source={authoredSource} language="tsx" title="ProductPage.tsx" />
				<p>
					The call to <code>products.find(props.productId)</code> runs on the server. The compiler
					sends the product ID and returns the product data allowed by <code>@exact shared</code>.
					Expanding and collapsing the details stays in the browser. There is no
					application-authored endpoint or request wrapper between those parts of the component.
				</p>
				<p>
					If <code>productId</code> changes, eXact starts the corresponding work and prevents an
					outdated run from overwriting the new product. Removing the component cancels its work,
					just as it does for a local <a href="#/learn/tasks">task</a>.
				</p>
			</section>
			<section>
				<h2>Supply the service for each request</h2>
				<p>
					The server must decide which user is making the request and which records they may read.
					Provide the repository through <code>requestContexts</code> when creating the runtime.
					Here, <code>repositoryForVerifiedRequest</code> is application code that authenticates the
					request and returns the appropriate repository.
				</p>
				<p>
					The generated server component carries the operations that the compiler permits the
					browser to invoke. <code>composeExactExecutorContract()</code> collects those operations
					and their endpoint into the <code>contract</code> used by the runtime. The example below
					assumes
					<code>ProductPage.tsx</code> is the compiled entry.
				</p>
				<CodeBlock
					source={requestContextSource}
					language="ts"
					title="Excerpt: configure a custom server runtime"
				/>
				<p>
					Each render or task invocation gets its own request context. The browser supplies the
					product ID, while your server determines the caller’s identity and access. Configure these
					providers before creating the runtime. Adding providers later does not reconfigure it.
				</p>
				<p>
					The Vite server starter already creates this wiring in <code>src/application.tsx</code>,
					using its generated <code>App</code> entry. You can add <code>requestContexts</code> to
					that runtime configuration and keep the starter's HTTP handler and hydration setup. For a
					custom host, the <a href="#/advanced">server setup guide</a> covers those remaining
					pieces.
				</p>
				<details>
					<summary>Owning and releasing request resources</summary>
					<p>
						A factory-backed context lets eXact own a resource’s lifetime and cleanup. An existing
						value supplied to the context keeps its existing owner. When a context scope closes,
						factory-owned resources are released before the dependencies they use.
					</p>
				</details>
			</section>
			<section>
				<h2>Choose which data the browser may receive</h2>
				<p>
					A product’s display name may be public even though the database connection is private.
					Application and request contexts stay on the server by default. Mark a method’s return
					value with <code>@exact shared</code> when it is intended to cross to the client. eXact
					still checks that value against its data policy and serialization rules.
				</p>
				<CodeBlock
					source={sharedProjectionSource}
					language="ts"
					title="Server resource contracts"
				/>
				<p>
					Dependencies used only by server work, such as a database SDK, GraphQL parser, or schema
					asset, stay in the server build. If you choose to call an existing API or GraphQL service,
					that call can be part of the task too.
				</p>
				<Callout title="Sharing a result does not grant access to it">
					<p>
						Your application authenticates requests and authorizes access to records. The compiler
						checks the data boundary: it rejects undeclared captures, non-serializable results,
						server resources in client state, and attempts to expose secret values.
					</p>
				</Callout>
				<details>
					<summary>Authorization hooks for a custom server</summary>
					<p>
						Use <code>authorize(request, context)</code> and
						<code>validateCsrf(request, context)</code> to check credentials and headers before body
						parsing. Use <code>authorizeOperation(request, input, context)</code> for checks that
						need the decoded operation. A forwarding host authenticates the request. The downstream
						service applies its own operation policy.
					</p>
					<p>
						When registering custom operations, use explicit entries in ordinary object literals for
						contracts, handlers, and payload decoders. Inherited properties do not register
						operations or authorize payloads.
					</p>
				</details>
			</section>
			<section>
				<h2>Render the first result on the server</h2>
				<p>
					The product page can arrive with its product already visible. Server-side rendering (SSR)
					resolves the request context and runs the server work before sending the resulting HTML.{' '}
					<strong>Hydration</strong> connects the browser component to that HTML and restores the
					settled state, so it does not need to repeat the initial request.
				</p>
				<p>
					Later changes still use the same task. Selecting another product loads its data and
					updates the existing component. Independent tasks can start while earlier tasks are
					waiting, subject to request concurrency limits, while HTML stays in page order.
				</p>
				<details>
					<summary>Sending HTML progressively</summary>
					<p>
						Progressive output can send a completed document head while body tasks are still
						running. The browser can discover stylesheets and scripts sooner. The body, hydration
						data, and closing tags follow in the same render. If pending work can change the head,
						or a transformation needs the complete output, eXact waits for that work first.
					</p>
					<p>
						String and streaming output both support hydration of the existing DOM. For custom
						response handlers, see <a href="#/advanced">server rendering and hydration setup</a>.
						The{' '}
						<a href="https://github.com/techjoshua/exact/blob/main/docs/ssr-hydration.md">
							SSR reference
						</a>{' '}
						covers publication, URL handling, and output limits.
					</p>
				</details>
			</section>
			<section>
				<h2>Add interactive regions to a server page</h2>
				<p>
					A mostly static page may only need JavaScript for a few controls. eXact can hydrate those
					regions independently. Each is called a <strong>client island</strong>. An island keeps
					its server-rendered content while its client code loads, then adopts that DOM and restores
					its state. Separate islands can load in either order.
				</p>
				<p>
					Components inside one client root share its hydration. Their local callbacks stay in that
					root. When an island contains other components, eXact restores their server-rendered state
					together as that island activates. Data passed to an independent island must be
					serializable. Wrappers can also accept <code>props.children</code> rendered on the server.
					eXact retains that content and any nested islands, so you do not need to recreate it in
					browser code.
				</p>
				<p>
					When a page component should run only on the server, you can mark it with
					<code>{'/** @exact server */'}</code>. Its interactive children can still become client
					islands.
				</p>
				<details>
					<summary>Choosing a bootstrap for a custom page</summary>
					<ul>
						<li>
							Use <code>hydrate(clientApp, root, options)</code> when one client root owns the tree.
						</li>
						<li>
							Use <code>createExactClient(root, options)</code> with the generated island
							registration for a page partitioned into independent islands. An islands-only
							bootstrap cannot activate a page that emitted no independent boundaries.
						</li>
					</ul>
					<p>
						Include the generated registration and endpoint settings for server operations in either
						mode, and dispose the client when retiring the page. An explicit
						<code>documentShell</code> preserves whole-application hydration for a client or
						isomorphic application. A server-only page inside that shell still uses its independent
						islands and the island bootstrap.
					</p>
					<p>
						Both APIs discover serialized configuration, including scripts beside the application
						root. An explicit read is usually unnecessary. <code>readExactHydrationConfig()</code>
						reads the document. Passing a root restricts the search to that subtree and returns an
						empty object if the script is elsewhere. For detached or shadow-root content, pass the
						container holding the script.
					</p>
					<p>
						See the{' '}
						<a href="https://github.com/techjoshua/exact/blob/main/docs/server-components.md">
							server component reference
						</a>{' '}
						for wrapper composition, captured state, and generated island boundaries.
					</p>
				</details>
			</section>
			<section>
				<h2>Let independent work finish</h2>
				<p>
					A slow request should not lose its result just because a separate operation finishes
					first. Server tasks that write different state fields can complete independently. When
					responses write overlapping fields, eXact protects the newer committed result from an
					older response. Replacing an object also overlaps writes to its properties. If any
					declared write conflicts, that response's state update is discarded together.
				</p>
				<p>
					A task can read a component prop such as <code>props.productId</code> directly. eXact
					captures the value for each server invocation, so pending work retains the input it
					started with. A nested assignment such as <code>this.state.profile.count = count</code>
					updates that field when the response arrives. Unrelated fields in <code>profile</code>
					keep their current browser values.
				</p>
			</section>
			<section>
				<h2>Keep work tied to the request</h2>
				<p>
					When a request disconnects, its rendering and server tasks should stop too. The composed
					server runtime carries the request’s abort signal through both. A render-specific signal
					can stop work sooner, but cannot keep it alive after the request ends or the runtime shuts
					down. Pass task signals to data clients so their I/O can stop as well.
				</p>
				<p>
					On Node, unexpected request and cleanup failures go to the runtime logger, or the server
					console if none is configured. Before a response starts, the client receives a generic
					error. After streaming starts, the failed stream closes. Error details stay in server
					logs.
				</p>
			</section>
			<section>
				<h2>See what the compiler generates</h2>
				<p>
					Like an async function that hides its callback machinery, the component describes a flow
					that the compiler implements across several execution steps. eXact generates the operation
					registration, captured inputs, cancellation, response validation, and state updates. You
					continue working with the component’s ordinary calls and state.
				</p>
				<p>
					The <a href="#/learn/compiler-tour">compiler tour</a> follows an example through those
					generated pieces. The{' '}
					<a href="https://github.com/techjoshua/exact/blob/main/docs/distributed-component-continuations.md">
						continuation reference
					</a>{' '}
					explains the protocol. Generated operation identifiers are opaque and should not be used
					as application API names.
				</p>
			</section>
		</Article>
	);
}
