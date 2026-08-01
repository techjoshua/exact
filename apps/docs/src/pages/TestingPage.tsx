import type { Component } from '@exactjs/core';
import { CodeBlock } from '../CodeBlock.jsx';
import { Article } from './Article.jsx';

const testingSource = `// Configure props and context before mounting the real component.
const view = await testComponent(Counter)
  .props({ initial: 1 })
  .context(AuthContext, auth)
  .mount();

// Prefer an accessible query and a user-shaped action.
await view.root.getByRole('button', { name: 'Increment' }).click();

// Inspect internal state only when behavior alone is not enough.
expect(view.root.state().count).toBe(2);
expect(view.root.find(Status).context(AuthContext)).toBe(auth);
view.unmount();`;

const serverTestingSource = `import { testServerComponent } from '@exactjs/testing';
import { AccountPage } from '../.exact/AccountPage.exact.server.js';

const view = await testServerComponent(AccountPage)
  .props({ accountId: '42' })
  .applicationContext(Services, services)
  .requestContext(CurrentUser, user)
  .render();

expect(view.html).toContain('Account 42');
expect(view.root.state().loaded).toBe(true);
expect(view.root.find(AccountSummary).context(CurrentUser)).toBe(user);
expect(view.root.providedContext(AccountContext)).toEqual(account);`;

const clientServerTestingSource = `const protocol = new ExactProtocolRecorder();
const runtime = createExactServerRuntime({
  ...serverOptions,
  onContextAccess: (observation) =>
    protocol.observeServerContextAccess(observation)
});

const server = await testServerComponent(AccountPage)
  .requestContext(CurrentUser, user)
  .render({ hydration: { endpoint: '/__exact' } });

const view = await mountClientServerTest({
  server,
  protocol,
  handle: (request) => handleExactRequest(request, runtime),
  islands,
});

// Generated client code initiates the real in-memory request.
await view.getByRole('button', { name: 'Save' }).click();

// IDs stay opaque: interrogate what actually crossed the boundary.
const exchange = view.protocol.exchanges[0];
expect(exchange.operations[0]?.type).toBe('action');
expect(exchange.clientOperations[0]?.patchesApplied).toBe(true);
expect(view.hydration[0]?.outcome).toBe('mounted');
expect(server.resumptions).toEqual(expect.any(Array));
expect(protocol.serverContextAccesses().map(({ token }) => token))
  .toContain('CurrentUser');
expect(view.component(AccountEditor).providedContext(EditorContext)).toBeDefined();
view.unmount();`;

/** Documents behavior-focused component, server, and client/server testing workflows. */
export function TestingPage(this: Component<{}>) {
	return () => (
		<Article
			eyebrow="Build for the web"
			title="Test behavior through the real component"
			description="Mount the DOM-rendered component, find controls the way a user does, and inspect framework state only when the test truly needs it."
			previous={{ path: '/guides/forms', label: 'Accessible forms' }}
			next={{ path: '/guides/react-compatibility', label: 'React compatibility' }}
		>
			<section>
				<h2>One fluent test surface</h2>
				<CodeBlock source={testingSource} language="ts" title="Counter.test.tsx" />
				<p>
					Queries are available by role and name, label, visible text, selector, and test ID.
					Singular queries reject both missing and ambiguous matches.
				</p>
			</section>
			<section>
				<h2>Settling is explicit</h2>
				<p>
					State and event actions flush reactive rendering and wait for observed component tasks.
					Long-lived work can opt out, while <code>view.flush()</code> and{' '}
					<code>view.settle()</code> keep timing choices visible.
				</p>
			</section>
			<section>
				<h2>Inspect the real server component</h2>
				<CodeBlock source={serverTestingSource} language="ts" title="AccountPage.server.test.ts" />
				<p>
					Import the compiler&apos;s server artifact so the test proves server placement rather than
					running the unsplit source as an ordinary component. Server tasks settle before the
					snapshot is captured. State, props, component ancestry, inherited context, and context
					provided for descendants remain inspectable after SSR disposes the live instances.
				</p>
				<p>
					Application and request values use their real scoped context runtime. Component-scoped
					values use <code>context()</code>; incorrectly supplying an application or request token
					there produces an error that points to the matching setup method.
				</p>
			</section>
			<section>
				<h2>Exercise both halves and inspect the exchange</h2>
				<CodeBlock
					source={clientServerTestingSource}
					language="ts"
					title="AccountPage.client-server.test.ts"
				/>
				<p>
					The paired view hydrates generated client islands and sends their requests directly to the
					application&apos;s server handler. It records request and response envelopes as well as
					whether response patches were applied, rejected, or ignored as stale. The server render
					exposes the public resumption records it emitted, and the paired view records whether each
					hydration target adopted existing DOM or mounted new DOM.
				</p>
				<p>
					Tests do not need a handwritten registry or compiler analysis to discover generated names.
					Trigger the behavior through the component, then inspect the recorded operation. Generated
					identifiers remain available as opaque protocol evidence without becoming part of the test
					contract. A shared recorder can also receive server-context access observations. Those
					records contain the authored token and operation identity, never the server-owned value.
				</p>
			</section>
		</Article>
	);
}
