import type { Component } from '@exactjs/core';
import { Article } from './Article.jsx';
import { Callout } from './Callout.jsx';
import { CodeBlock } from '../CodeBlock.jsx';

const documentSource = `import { Document } from '@exactjs/core/document';

return () => (
  <Document>
    <html lang={this.state.locale}>
      <head><title>{this.state.title}</title></head>
      <body className:dark={this.state.dark}><App /></body>
    </html>
  </Document>
);`;

type AdvancedCard = { /** @exact key */ title: string; text: string; packages: string };
const advancedCards: AdvancedCard[] = [
	{
		title: 'SSR and hydration',
		text: 'Render HTML on the server, adopt it in the browser, and defer eligible interactions.',
		packages: '@exactjs/ssr · @exactjs/hydrate'
	},
	{
		title: 'Server execution',
		text: 'Use server resources from component tasks while keeping private code out of the browser.',
		packages: '@exactjs/compiler · @exactjs/server'
	},
	{
		title: 'Streaming',
		text: 'Reveal ready Suspense content while the rest of the page continues loading.',
		packages: '@exactjs/ssr'
	},
	{
		title: 'React compatibility',
		text: 'Use supported React packages inside an eXact application.',
		packages: '@exactjs/react-compat'
	},
	{
		title: 'Build integrations',
		text: 'Compile eXact applications with Vite, Webpack, Bun, or exactc.',
		packages: '@exactjs/vite-plugin · @exactjs/webpack-plugin · @exactjs/bun-plugin'
	},
	{
		title: 'Microfrontends',
		text: 'Expose trusted component roots from independently deployed applications.',
		packages: '@exactjs/microfrontends'
	}
];

/** Introduces eXact features that span browser and server runtimes. */
export function AdvancedPage(this: Component<{}>) {
	return () => (
		<Article
			eyebrow="Explore"
			title="Beyond the browser"
			description="Add server rendering, server tasks, streaming, React packages, and microfrontends when your application needs them."
			previous={{ path: '/examples/logo-lab', label: 'Logo lab' }}
			next={{ path: '/packages', label: 'Package map' }}
		>
			<section>
				<h2>Choose the features you need</h2>
				<div className="card-grid advanced-grid">
					{advancedCards.map((card) => (
						<div theme:surface="raised" className="topic-card">
							<strong>{card.title}</strong>
							<p>{card.text}</p>
							<code>{card.packages}</code>
						</div>
					))}
				</div>
			</section>

			<section>
				<h2>Start with a client component</h2>
				<p>
					Build the component, add routing and forms, then test its behavior. Add server rendering
					or server tasks when they improve startup, data access, or security.
				</p>
			</section>

			<section>
				<h2>Server rendering and hydration</h2>
				<p>
					Await <code>renderToString()</code> or <code>renderToHydratableString()</code> before
					reading the result. String and streaming output share one renderer. Component tasks run
					through the task system; the renderer waits for pending work needed by the output and
					continues immediately when that work is already complete. Ready tasks start immediately
					when the request's task concurrency limit has room; otherwise they wait for an available
					slot.
				</p>
				<p>
					The result's <code>html</code> contains the completed markup. Use
					<code>htmlWithHydration</code> from <code>renderToHydratableString()</code> when sending a
					document that the client will hydrate. For a complete document, eXact inserts hydration
					before the closing body tag; application code does not need to split or rebuild the HTML.
				</p>
				<p>
					Pass the request's <code>AbortSignal</code> through the SSR <code>signal</code> option to
					cancel pending waits when the request ends. An already-aborted signal rejects the wait
					immediately; failures from work settling during cleanup remain handled.
				</p>
				<p>
					In custom Node page handlers, pass complete SSR responses to
					<code>writeNodeResponse()</code> from <code>@exactjs/node-adapter</code>. The adapter
					sends buffered documents in one terminal write and preserves progressive publication for
					streaming responses. Use <code>writeNodeResponseBody()</code> when your handler needs to
					keep the response open for additional content.
				</p>
				<p>
					Pass progressive responses from <code>renderToHydratableProgressiveHtmlResponse()</code>
					directly to the platform adapter. Bun uses <code>exactResponseToBunResponse()</code>;
					other Fetch hosts use <code>exactResponseToFetchResponse()</code>. An owned
					<code>response.body</code> exposes its consumption capabilities explicitly. Buffered
					bodies support <code>toText()</code>; asynchronous producers require a writer or stream.
					Choose one consumer and let the adapter preserve cancellation and backpressure. Custom
					adapters can observe an asynchronous body's <code>signal</code> to interrupt blocked
					writes when the body is cancelled. Transfer any request-owned resources before starting
					consumption.
				</p>
				<p>
					Node handlers automatically adapt request scheduling under load. Use
					<code>createExactNodeHandler()</code> for framework endpoints or wrap a custom page
					handler with <code>createNodeHandler()</code> from <code>@exactjs/node-adapter</code>.
					Create the handler once per host and forward its disconnect signal to rendering and
					response writing. Quiet requests start immediately; busy hosts trial batched starts,
					retain them when completion capacity and event-loop delay improve, or when low-lag
					scheduling completes admitted work with spare capacity. They keep a successful policy
					active while delay is low and the event loop has spare capacity. Isolated busy samples do
					not interrupt that policy. Saturated workloads retain prompt reassessment, with routine
					rechecks due after 30 seconds. Quiet traffic resets the policy.
				</p>
				<p>
					Native Bun also adapts scheduling automatically. Use <code>createExactBunHandler()</code>
					for endpoints or <code>createBunRequestHandler()</code> for a complete Fetch dispatcher.
					Forward both request and server arguments through wrappers, and route all HTTP requests
					through that dispatcher instead of a separate Bun routes map. Bun measures native request
					drain and event-loop delay without wrapping response bodies. Under CPU load, it retains
					measured capacity gains while timer delay remains responsive. A responsive policy can stay
					active at lower offered demand while native responses keep draining and the event-loop
					thread has spare CPU. Runtimes without usable thread CPU accounting retain capacity-based
					trials. Sparse traffic stays immediate;
					<code>{'{ adaptive: false }'}</code> disables automatic scheduling.
				</p>
				<p>
					Forward <code>request.signal</code> to Bun SSR. String rendering follows the adaptive
					policy, while progressive rendering uses cooperative work windows at render entry and
					after pending data settles. Both APIs use the same compiled components. Ready components
					continue synchronously, and output still follows transport backpressure. Initial Fetch
					admission retains the host-wide adaptive policy even when a server uses both output modes.
				</p>
				<p>
					Server rendering produces HTML and public component state. Hydration adopts the existing
					DOM, preserves form state and focus, and continues the same component in the browser.
					Sibling components retain their DOM and continue receiving updates to parent-owned props.
					Hydrate an embedded document from its own window; hydration does not transfer a root
					across document boundaries.
				</p>
				<p>
					For roots without server operations or client islands, <code>hydrateAfterNavigation</code>
					from <code>@exactjs/hydrate/root</code> accepts an element or the current{' '}
					<code>document</code>. It gives visible server HTML a rendering opportunity before
					hydration, while activating synchronously if a user interaction arrives first. This can
					improve initial paint while moving passive application readiness slightly later. Pass a
					synchronous root factory to defer preparation too, for example
					<code>
						{
							'hydrateAfterNavigation(() => <App {...readPublishedRootProps(App, container)} />, container)'
						}
					</code>
					. The factory runs once when activation starts; static imports still evaluate normally.
				</p>
				<p>
					Use <code>renderMode: 'hydrate'</code> for browser builds that adopt server HTML,
					<code>renderMode: 'client'</code> for client-only builds, or the default mode when one
					build must support both.
				</p>
				<p>
					Eligible controls can load their client code on first interaction. The compiler explains
					why a component must hydrate eagerly when it cannot be deferred safely.
				</p>
				<p>
					For request data passed into the root component, <code>publishRootProps</code> and
					<code>readPublishedRootProps</code> provide one bootstrap copy for both client
					construction and hydration. State derived directly from those inputs is not serialized a
					second time. Pass the compiled root component to <code>readPublishedRootProps</code> so a
					compact component-bound payload can be decoded against the matching client artifact.
					Compiler-declared fields are read once while constructing that payload, so use data
					properties rather than side-effecting getters for published inputs.
				</p>
				<p>
					Document shells are ordinary eXact components. Render <code>html</code>, <code>head</code>
					, and <code>body</code> with the same props, state, tasks, and reactive expressions as
					other components. The compiler optimizes their server output while the framework preserves
					document validation and client adoption. When only the application needs hydration, render
					it as the requested root and use <code>documentShell</code> to wrap it in a document
					component. Forward the supplied application child exactly once, then hydrate that
					application in its matching body container. Shell props and state stay on the server.
					Render the document as the requested root when the document itself needs client
					reactivity.
				</p>
				<h3>Compose a document shell</h3>
				<p>
					<code>Document</code> from <code>@exactjs/core/document</code> fills missing html, head,
					and body elements while preserving supplied attributes and reactive bindings. It supplies
					UTF-8 metadata and a fallback title only when those immediate head children are absent.
					You can supply just application content, selected sections, or a complete html element. It
					examines immediate children and does not inspect another component's output.
				</p>
				<CodeBlock source={documentSource} language="tsx" title="Document shell" />
				<p>
					The shell authors an HTML5 doctype. Its optional <code>doctype</code> prop accepts
					<code>{'{ name, publicId, systemId }'}</code>. A replacement shell can render
					<code>{'{doctype()}'}</code> before its html element, importing <code>doctype</code>
					from the same module. The declaration appears once and survives hydration.
				</p>
				<p>
					<code>Document</code> places framework styles and head scripts after authored head
					content, followed by hydration data and bootstrap scripts at the body tail. Supply
					request-specific assets through the renderer's <code>documentAssets</code> option:
					<code>{'{ styles: ["/app.css"], bootstrap: [{ src: "/app.js" }] }'}</code>. Custom shells
					can place <code>documentOutput.styles</code>,<code>documentOutput.headScripts</code>,{' '}
					<code>documentOutput.hydrationData</code>, and <code>documentOutput.bootstrap</code>{' '}
					explicitly. Keep hydration before bootstrap.
				</p>
				<p>
					Root-prop publication works with string and progressive HTML rendering. For an authored
					full document, progressive HTML sends the rendered head and body content before the
					hydration payload and closing tags. Browsers can discover resources before hydration
					finishes arriving. A completed head can arrive while descendant body tasks are pending,
					followed by incremental body output. Configure <code>streamBufferSize</code> to change the
					body flush threshold in bytes (8192 by default); complete spans may exceed it. Tasks owned
					by the document can also allow an early head when the compiler proves that the head is
					static and the body contains only intrinsic markup and direct state reads. Calls, child
					components, and dynamic attributes keep the document view waiting for its tasks. Pending
					state is never read for discovery. Web Streams allow bounded read-ahead of four thresholds
					before applying backpressure. Whole-document output transformations retain collection.
				</p>
				<p>
					Pass <code>{'{ adaptive: false }'}</code> to a Node or Bun handler factory to disable
					automatic scheduling. The configurable <code>maxBatchSize</code> defaults to 32 starts per
					callback. Trials can briefly be slower before backing off, so compare complete response
					p95/p99 alongside throughput for your workload. Use <code>scheduleRender</code> for a
					custom host policy. Forward the Node handler's signal or Bun's
					<code>request.signal</code> to SSR to inherit host scheduling at render entry and after
					pending component data settles. Ready components continue immediately, and head output can
					still precede pending body tasks. An explicit hook replaces the inherited render policy;
					disable adapter admission when replacing its entire policy.
				</p>
			</section>

			<Callout title="Prepare production controls" tone="warning">
				<p>
					Configure authorization, CSRF protection, CSP, request limits, deployment pinning,
					observability, and request context before production deployment. Check the relevant guide
					for current host and integration limits.
				</p>
			</Callout>
		</Article>
	);
}
