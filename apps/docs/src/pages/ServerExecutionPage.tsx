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

const requestContextSource = `const runtime = createExactServerRuntime({
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
			previous={{ path: '/learn/async-interfaces', label: 'Suspense, Activity & scheduling' }}
			next={{ path: '/learn/language-tools', label: 'Compiler-aware language tools' }}
		>
			<section>
				<h2>Resume interactive regions inside server pages</h2>
				<p>
					A server-rendered page can contain independently hydrated client regions. eXact keeps each
					region's public props and captured state with its boundary, so lazy regions can load in
					either order and adopt their existing DOM. Completed server work resumes from its captured
					result. Components inside a single client root share that root's hydration ownership.
					Their local callbacks do not require separate island registrations. The same behavior
					applies to string and streaming SSR, including keyed lists populated by server tasks.
					Restored arrays remain iterable when captured state includes both a list and nested fields
					such as its length. Prop-derived initial values do not overwrite restored server results;
					subsequent prop changes still update dependent values.
				</p>
				<p>
					Use <code>hydrate(clientApp, root, options)</code> when one client root owns the component
					tree. For a partitioned server page, use
					<code>createExactClient(root, options)</code> with the generated island registration. An
					islands-only bootstrap cannot activate a page that emitted no independent boundaries.
					Include the generated registration and endpoint settings for server operations in either
					mode, and dispose the client when retiring the page.
				</p>
				<p>
					Eager intrinsic islands with statically inspectable props retain their initial server
					markup while client code loads. Components that resume server work retain their client
					instance whether their view is inline or returned by an ordinary helper. Interactive
					controls inside that hydrated owner keep callback props local; they do not introduce
					another serialization boundary. Independent islands still require serializable props.
				</p>
			</section>
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
				</p>
				<p>
					For repeated records with a known shape, the compiler can generate server-only hydration
					validation code. It preserves the same serialization checks and payload format, while
					older compiled components continue through the standard validator. This adds no browser
					code or application configuration.
				</p>
			</section>
			<section>
				<h2>Server context stays on the server</h2>
				<CodeBlock source={authoredSource} language="tsx" title="ProductPage.tsx" />
				<CodeBlock source={requestContextSource} language="ts" title="Server runtime setup" />
				<p>
					Configure <code>requestContexts</code> when creating the runtime. In this example,
					<code>repositoryForVerifiedRequest</code> authenticates the adapter-provided platform
					request and selects an application-owned repository. Caller identity comes from that
					server verification, not a client task argument. Each SSR or invocation request has its
					own context; adding providers to an already-created runtime does not reconfigure it.
				</p>
				<p>
					The server runtime supplies the base context for each request. The compiler sends the
					product ID and returns the shared product data to component state. The server context
					stays private.
				</p>
				<p>
					Use a factory-backed context when the server should own a resource's lifetime and cleanup.
					A supplied context value keeps its existing owner. Request contexts remain isolated. When
					a scope closes, factory-owned resources are released before the dependencies they consume.
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
					Progressive HTML can send a completed document head before tasks in its body finish, so
					the browser can discover stylesheets and scripts sooner. The body then completes in the
					same render, followed by hydration data and the closing document tags. If the document
					component itself has pending work that can change its head, publication waits for that
					work. Whole-output transformations also retain complete-output publication. Native
					stylesheet lists in an authored head and resumable components in its body can both hydrate
					in place from string or streaming output.
				</p>
				<p>
					The compiler includes known-safe literal URLs in static server markup. Dynamic URLs still
					pass through the server's URL policy, and browser property updates keep their usual
					behavior. Static stylesheet links and empty external scripts with static attributes can
					share the surrounding document markup without separate server attribute processing.
					Scripts retain their identity for browser adoption and their usual loading behavior.
				</p>
				<p>
					The renderer counts compiler-known markup and dynamic output as it is produced. Buffered
					ranges reuse that accounting when it remains valid, with exact UTF-8 byte limits and
					rollback preserved before output is committed.
				</p>
				<p>
					During SSR, the server can resolve context and finish server tasks before sending HTML.
					Hydration adopts that HTML and restores the browser component without repeating settled
					work. Its payload is validated before publication, and collection-encoding bookkeeping is
					allocated only when registered collections require it. Later dependency changes run the
					server task again and update the same component.
				</p>
				<p>
					The compiler starts independently ready component tasks through a bounded request
					scheduler, even when an earlier sibling has not finished rendering. Output still follows
					authored order, and every task frame is disposed with its request. A real data, context,
					or selection dependency continues to delay only the work that depends on it.
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
				<p>
					The Node adapter reports unexpected request, response-production, and cleanup failures
					through the server runtime&apos;s logger, falling back to the server console when none is
					configured. Clients receive a generic error before response commitment; a failed stream is
					closed after commitment. Error details stay in server logs.
				</p>
			</section>
			<section>
				<h2>Authenticate requests and authorize operations</h2>
				<p>
					Configure <code>authorize(request, context)</code> and
					<code>validateCsrf(request, context)</code> to check request credentials and headers
					before body parsing. Use <code>authorizeOperation(request, input, context)</code>
					for policy that needs a decoded local operation. Forwarding hosts authenticate requests;
					downstream services own their operation policy.
				</p>
			</section>

			<Callout title="Compiler errors protect the boundary">
				<p>
					Compilation rejects undeclared captures, non-serializable results, server resources in
					client state, and attempts to expose secrets. Follow the error message to the value that
					crossed the boundary.
				</p>
			</Callout>
			<section>
				<h2>Explicit operation registration</h2>
				<p>
					Custom server operation contracts, handlers, and payload decoders must be explicit entries
					in their registration objects. Inherited properties do not register an operation or
					authorize its payload. Use ordinary object literals when configuring these maps.
				</p>
			</section>
		</Article>
	);
}
