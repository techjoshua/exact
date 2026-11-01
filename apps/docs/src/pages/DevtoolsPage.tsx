import type { Component } from '@exactjs/core';
import { CodeBlock } from '../CodeBlock.jsx';
import { Article } from './Article.jsx';
import { Callout } from './Callout.jsx';

const buildConfig = `export default defineExactConfig({
  debug: {
    catalog: 'auto',
    runtime: 'auto'
  }
});`;

const authorization = `const server = createExactServerRuntime({
  contract,
  inspectionCatalogs: [inspectionCatalog],
  allowDebug: async ({ platformRequest, capability }) => {
    const operator = await authenticateIncidentOperator(platformRequest);
    return operator.debug &&
      (capability !== 'source' || operator.sourceDebug);
  }
});`;

/** Documents the optional full-stack runtime inspection boundary. */
export function DevtoolsPage(this: Component<{}>) {
	return () => (
		<Article
			eyebrow="Learn"
			title="Inspect the running system"
			description="Inspect a running application’s component tree, state, tasks, and server requests."
			previous={{ path: '/learn/language-tools', label: 'Language tools' }}
			next={{ path: '/learn/compiler-tour', label: 'How compilation helps' }}
		>
			<section>
				<h2>Open the eXact panel</h2>
				<p>
					When a result on screen looks wrong, you need to trace it back to the state and work that
					produced it. eXact’s DevTools show the mounted component’s state, inputs, and running
					tasks together, so you can follow that connection while the application runs.
				</p>
				<p>
					Install the Chromium extension, open your application, and select the eXact panel in
					browser DevTools. The application needs an inspection-enabled build. Development
					configuration can enable it automatically. Production access requires explicit
					authorization.
				</p>
				<p>
					For a local checkout, follow the{' '}
					<a href="https://github.com/techjoshua/exact/tree/main/packages/chromium-devtools#build-and-install">
						build and installation instructions
					</a>
					. The next sections explain what to inspect and how to control access.
				</p>
			</section>
			<section>
				<h2>Inspect a component</h2>
				<p>
					Open the eXact panel in Chromium DevTools and select a component. You can inspect its
					props, state, child components, and running tasks. When an update behaves unexpectedly,
					start by checking the value and the task that changed it.
				</p>
				<p>
					Inspection combines two deliberately separate sources. A compiler catalog explains static
					facts such as source ranges, dependencies, effects, and placement reasons. Optional
					runtime instrumentation contributes live instances, bounded state previews, task status,
					and timeline events. The protocol joining them is read-only and requires explicit
					production authorization.
				</p>
				<p>
					Catalog registration validates source identities and complete records before making them
					available for inspection. Event history captures independent observations, so changing an
					observed value cannot change application state or another timeline reader. Inspection
					observations use TypeScript readonly fields and ordinary JavaScript data. Compiler
					inspection snapshots and build reports follow the same rule and remain separate from
					retained compiler analysis. Deep source trees remain inspectable within the catalog's
					entity budget. Missing entries, duplicate identities, and cyclic source trees are
					rejected. An inspection response that exceeds transport limits reports{' '}
					<code>limit-exceeded</code>. Smaller descendants can still be selected independently.
					Large or deeply nested snapshots remain subject to renderer node and transport limits.
					Snapshot byte limits apply to the encoded response delivered to the client. Optional audit
					records count those same UTF-8 bytes.
				</p>
				<p>
					Client-only pages open a local inspection session and do not probe a conventional server
					URL. Server cooperation begins only when the runtime receives an explicit endpoint or
					discovers one in compiler-owned hydration metadata.
				</p>
				<p>
					For a custom Vite middleware server, include the eXact <code>exact()</code> plugin in the
					configuration it loads. This enables the same inspection support as an ordinary Vite app.
				</p>
			</section>
			<section>
				<h2>Enable inspection and authorize access</h2>
				<CodeBlock source={buildConfig} language="ts" title="exact.config.ts" />
				<p>
					The catalog is server-owned rich metadata. Runtime instrumentation carries only compact
					correlation identities. Development can enable both automatically. Hardened builds set
					both controls to <code>false</code>. A production deployment must enable output
					deliberately and still authorize each session. The Vite, Webpack, and Bun integrations
					keep catalog assets in their server output and outside public client graphs. Session
					limits also apply to concurrent requests. Revocation and expiry take effect even while an
					asynchronous authorization check or inspection query is pending. A result that arrives
					after its session expires or closes, its request is canceled, or the debug runtime stops
					is unavailable. Optional audit callbacks receive metadata before publication. Synchronous
					retirement inside a callback also makes the result unavailable. Callback failures are
					isolated, and asynchronous audit work does not delay the response.
				</p>
				<p>
					While DevTools is attached, each server response carries only the observations produced by
					that request. Browser DevTools combines those responses into its bounded timeline. The
					server does not retain cross-request history. Closing or expiring the session stops
					collection for pending requests and discards unpublished observations while ordinary
					application work can finish. Collection has its own bounded retention. An explicit
					response size cap keeps the newest complete events that fit the remaining response budget.
					Without an explicit cap, crossing the default response threshold warns and preserves
					collected events.
				</p>
				<p>
					Production inspection is optional. Enable it only where you intend to offer debugging
					access, and configure authorization for each session. Inspection keeps limited previews
					and history rather than retaining application objects indefinitely. Enabling inspection
					preserves configured render and hydration work limits and callbacks.
				</p>
				<CodeBlock source={authorization} language="ts" title="server.ts" />
				<p>
					Client inspection shows bounded previews of values already present in the page, including
					state, props, contexts, and task values. It does not hide them by secret name. Keep
					private values on the server. Server inspection applies redaction before sending previews
					to the browser.
				</p>
				<p>
					Server catalog registration captures build identity and redaction metadata. Editing a
					supplied catalog leaves the registration intact. Retire a build with its registration
					handle and register its replacement explicitly.
				</p>
			</section>
			<section>
				<h2>Find state and task history</h2>
				<p>
					Select an element to find its logical component owner, source component, build, and
					execution root. State and public contexts appear as bounded previews. Tasks keep their
					placement, readiness, priority, generation, cancellation, concurrency, and optimistic
					status. Activity, Suspense, hydration, requests, continuations, patches, and errors share
					the same timeline vocabulary. Compiler-marked task IDs travel with each function
					definition, so the inspector never guesses identity from array order. Selections from a
					previous session or build do not resolve current DOM or component details. Task rows
					retain their distinct operation identities and generations.
				</p>
				<p>
					Completed, failed, and cancelled tasks remain visible as a bounded execution history for
					the attached inspection session. Each row starts collapsed and exposes bounded previews of
					its invocation arguments and result or error on demand. The scheduler still releases its
					live frame and the runtime never retains the original application values. By default, the
					200 most recently started executions are shared across a runtime owner. Integrations can
					tune the cap with <code>maxTaskExecutions</code>. Inspection preserves task failure and
					cancellation behavior. Editing an inspection response does not update application state.
					Session descriptions and DOM snapshots are ordinary observations with TypeScript readonly
					declarations. Editing a session description does not change its routing or cleanup.
				</p>
			</section>
			<section>
				<h2>Inspect remote applications</h2>
				<p>
					The page host authenticates and forwards remote requests through its binding gateway.
					Cookies and authorization headers pass through. Applications can add service credentials.
					Each binding keeps its own component lookups and subscriptions. Each service authenticates
					independently and applies its own <code>allowDebug</code>
					policy. A configured callback must return or resolve to <code>true</code> to approve
					access. Other results and errors leave inspection unavailable. The session ID correlates
					results and grants no authority. eXact does not open child sessions or coordinate
					authentication between hosts.
				</p>
				<p>
					Remote observations return with the operation response after independent authorization.
					The browser merges them into the page timeline without creating a server-side remote
					history.
				</p>
				<p>
					The development default accepts only matching browser origins. Origin-less tooling must
					configure an explicit <code>allowDebug</code> policy or authenticated session identity.
					Browser origins are checked against the configured <code>publicOrigin</code> or an
					absolute adapter request URL. Configure <code>publicOrigin</code> when your adapter
					supplies relative URLs, or when an internal service address differs from the browser
					address.
				</p>
			</section>
			<section>
				<h2>Use the panel and automation tools</h2>
				<p>
					In the Components view, select an instance to see its props, state, contexts, and tasks.
					Expand a value to inspect its fields. The tree preserves expanded branches and scroll
					position as the application updates. Completed and cancelled task runs remain available in
					the session history.
				</p>
				<p>
					The Profiler records an explicit interaction window, groups events into causal framework,
					interaction, or request frames. Here, unlike the instance tree, it aggregates reactive
					changes and task work into waterfall lanes per authored component type so repeated costs
					are visible. Stopping the recording finalizes it from retained history after the starting
					cursor, so delayed subscription delivery cannot leave a silent gap. Timeline and error
					queries can still report recorded events when component inspection is unavailable. The
					Microfrontends view summarizes independently deployed roots. The CDP agent sends the same
					validated requests through fixed functions. Debug messages require supported request names
					and capabilities and reject unknown envelope fields. Debug envelopes are validated before
					authorization, and query envelopes are validated before query dispatch. Neither surface
					can evaluate caller JavaScript, mutate state, invoke tasks, or receive raw component
					instances. CDP discovery, messages, pending requests, and connection lifetimes are
					bounded. Automation can supply a cancellation signal, whose exact reason is preserved,
					including null. Supply a target ID when discovering a specific page. An unavailable ID
					fails the connection. Requests made after the transport closes reject immediately. Failed
					connection setup releases partial resources. Disconnect attempts every owned cleanup even
					when one fails.
				</p>
				<p>
					For an automated investigation, <code>@exactjs/devtools-agent</code> can connect to an
					existing Chromium page. Start with <code>session.describe</code> and a bounded
					<code>roots.list</code> query, then select a component and inspect its state, tasks, or
					errors. Filter component trees by their side, binding, build, execution root, component
					type, or instance to narrow the results before paging. Root and microfrontend lists can be
					narrowed by their root ownership coordinates. Combined browser and server lists resume
					each source independently, continuing until the requested page fills or the sources
					finish. Use each returned cursor with the same collection and filters. Custom integrations
					can choose a positive whole-number result limit to control the size of each page. Query
					parsers reject invalid configured limits even when optional fields are absent. A query
					that exceeds its inspection budget is unavailable. Keep the returned runtime identity with
					subsequent requests. A denied or unavailable query means inspection could not complete.
					The
					<a href="https://github.com/techjoshua/exact/tree/main/packages/devtools-agent">
						agent connection example
					</a>
					shows a query and connection cleanup. Connection and subscription cleanup methods can be
					decorated using ordinary assignment. Readonly fields remain TypeScript restrictions, and a
					live subscription reports its cleanup state through its <code>closed</code> getter.
				</p>
				<p>
					Build <code>@exactjs/chromium-devtools</code> from the repository and load
					<code>packages/chromium-devtools</code> as an unpacked extension at
					<code>chrome://extensions</code>. Select the package directory. The panel reports whether
					it is waiting for the page connection or application instrumentation and reconnects after
					navigation. See the{' '}
					<a href="https://github.com/techjoshua/exact/tree/main/packages/chromium-devtools">
						installation guide
					</a>
					for the build command and requirements.
				</p>
				<p>
					Custom integrations should dispose their runtime installation when its application root
					closes. Disposal prevents a pending connection from attaching later. Disconnect can be
					followed by a fresh connection, while disposal permanently closes that installation.
					Server cooperation validates the returned session and matches each response to its query
					and active session. Malformed responses cannot attach a session or become inspection
					records. Inspection metadata accepts plain data records and dense arrays. Accessor fields
					and custom array iteration are rejected. Untrusted query data is copied before validation.
					Accessor fields and unsupported values are rejected without running getters or custom
					iterators, and later changes to the supplied object cannot alter the validated request.
					Highlight cleanup also restores styles on detached elements and preserves later changed
					outline values. Highlights require the active installation session. Older
					inspection-factory cleanup preserves a newer installation, including when both use the
					same callback.
				</p>
				<p>
					Source navigation opens only exact SHA-256 matches, checking source-mapped resources, then
					workspace files, then an independently authorized server excerpt.
				</p>
			</section>
			<Callout title="Redact before traversal">
				<p>
					Compiler-qualified secrets and server resources become selectors, never values. Preview
					construction applies those selectors before inspecting an object and never invokes
					getters, serialization hooks, callbacks, or a failed Proxy again. Collection previews
					bypass custom Map and Set iterators, and type labels use stored names without calling
					accessors. Undefined, non-finite numbers, and negative zero retain distinct constant
					previews across JSON transport. The panel quotes strings and displays constants without
					quotes. Empty property names remain visible. Over-budget property names stop traversal and
					mark the object preview truncated.
				</p>
			</Callout>
		</Article>
	);
}
