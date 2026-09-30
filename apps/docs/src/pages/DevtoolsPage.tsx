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
					asynchronous authorization check is pending.
				</p>
				<p>
					While DevTools is attached, each server response carries only the observations produced by
					that request. Browser DevTools combines those responses into its bounded timeline. The
					server does not retain cross-request history.
				</p>
				<p>
					Production inspection is optional. Enable it only where you intend to offer debugging
					access, and configure authorization for each session. Inspection keeps limited previews
					and history rather than retaining application objects indefinitely.
				</p>
				<CodeBlock source={authorization} language="ts" title="server.ts" />
			</section>
			<section>
				<h2>Find state and task history</h2>
				<p>
					Select an element to find its logical component owner, source component, build, and
					execution root. State and public contexts appear as bounded previews. Tasks keep their
					placement, readiness, priority, generation, cancellation, concurrency, and optimistic
					status. Activity, Suspense, hydration, requests, continuations, patches, and errors share
					the same timeline vocabulary. Compiler-marked task IDs travel with each function
					definition, so the inspector never guesses identity from array order.
				</p>
				<p>
					Completed, failed, and cancelled tasks remain visible as a bounded execution history for
					the attached inspection session. Each row starts collapsed and exposes redacted previews
					of its invocation arguments and result or error on demand. The scheduler still releases
					its live frame and the runtime never retains the original application values. By default,
					the 200 most recently started executions are shared across a runtime owner. Integrations
					can tune the cap with <code>maxTaskExecutions</code>.
				</p>
			</section>
			<section>
				<h2>Inspect remote applications</h2>
				<p>
					The page host authenticates and forwards remote requests through its binding gateway.
					Cookies and authorization headers pass through. Applications can add service credentials.
					Each service authenticates independently and applies its own <code>allowDebug</code>
					policy. The session ID correlates results and grants no authority. eXact does not open
					child sessions or coordinate authentication between hosts.
				</p>
				<p>
					Remote observations return with the operation response after independent authorization.
					The browser merges them into the page timeline without creating a server-side remote
					history.
				</p>
				<p>
					The development default accepts only matching browser origins. Origin-less tooling must
					configure an explicit <code>allowDebug</code> policy or authenticated session identity.
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
					cursor, so delayed subscription delivery cannot leave a silent gap. The Microfrontends
					view summarizes independently deployed roots. The CDP agent sends the same validated
					requests through fixed functions. Neither surface can evaluate caller JavaScript, mutate
					state, invoke tasks, or receive raw component instances. CDP discovery, messages, pending
					requests, and connection lifetimes are bounded, and automation can supply a cancellation
					signal.
				</p>
				<p>
					For an automated investigation, <code>@exactjs/devtools-agent</code> can connect to an
					existing Chromium page. Start with <code>session.describe</code> and a bounded
					<code>roots.list</code> query, then select a component and inspect its state, tasks,
					or errors. Keep the returned runtime identity with subsequent requests. A denied or
					unavailable query means inspection could not complete. The
					<a href="https://github.com/techjoshua/exact/tree/main/packages/devtools-agent">
						agent connection example
					</a>
					shows a query and connection cleanup.
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
					Source navigation opens only exact SHA-256 matches, checking source-mapped resources, then
					workspace files, then an independently authorized server excerpt.
				</p>
			</section>
			<Callout title="Redact before traversal">
				<p>
					Compiler-qualified secrets and server resources become selectors, never values. Preview
					construction applies those selectors before inspecting an object and never invokes
					getters, serialization hooks, callbacks, or a failed Proxy again.
				</p>
			</Callout>
		</Article>
	);
}
