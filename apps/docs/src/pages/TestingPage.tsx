import type { Component } from '@exactjs/core';
import { CodeBlock } from '../CodeBlock.jsx';
import { Article } from './Article.jsx';

const testingSource = `// Configure props and context before mounting the real component.
const view = await testComponent(Counter)
  .props({ initial: 1 })
  .context(AuthContext, auth)
  .mount();

// Prefer an accessible query and a user-shaped interaction.
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

/** Documents behavior-focused component, server, and client/server testing workflows. */
export function TestingPage(this: Component<{}>) {
	return () => (
		<Article
			eyebrow="Build for the web"
			title="Test the real component"
			description="Render a component in a test, interact with it, and check what the user sees."
			previous={{ path: '/guides/forms', label: 'Accessible forms' }}
			next={{ path: '/advanced', label: 'Beyond the browser' }}
		>
			<section>
				<h2>Render a component and use its controls</h2>
				<p>
					A useful component test should tell you whether a user action produced the right result.
					<code>@exactjs/testing</code> lets you mount the component, use its controls, and wait for
					the resulting reactive work before making assertions.
				</p>
				<CodeBlock source={testingSource} language="ts" title="Counter.test.tsx" />
				<p>
					The test renders a component, finds a control by its role and accessible name, and acts on
					it. Assert the resulting text or state of the control. Queries also support labels,
					visible text, selectors, and test IDs. A query for one element fails if none or several
					match.
				</p>
			</section>
			<section>
				<h2>Wait for work to finish</h2>
				<p>
					Await test interactions so rendering and the component tasks they start can finish before
					you assert the result. Use <code>view.flush()</code> to apply pending reactive updates and
					<code>view.settle()</code> to wait for observed work. Long-lived tasks can opt out of
					settlement so a persistent connection does not block the test.
				</p>
			</section>
			<section>
				<h2>Test client and server together</h2>
				<p>
					The <code>exactVitest()</code> integration also configures installed eXact packages to
					share the compiled test&apos;s runtime and export conditions. This remains active when
					automatic matchers are disabled.
				</p>
				<p>
					Use <code>mountClientServerTest()</code> to render on the server, hydrate in a test DOM,
					and send task requests to the application&apos;s server handler. Trigger controls through
					accessible queries and assert the resulting page state. Mount waits for eager islands to
					load and hydrate, and rejects if loading fails. Islands deferred until interaction remain
					dormant until you interact with them.
				</p>
				<p>
					Supply the same generated registration as production: pass
					<code>exactHydrationRegistration.islands</code> as <code>islands</code> and spread
					<code>exactHydrationRegistration</code> into <code>hydrate</code>. When the server omits
					continuation contracts from HTML, the generated registration must provide them. Keep the
					SSR renderer import in a compiled application or fixture module so optional enhancements
					are available. Await the final observable result of a multi-stage task before unmounting.
				</p>
				<p>
					The paired view can also report whether hydration adopted existing DOM and whether a
					server response was applied. Use those details when diagnosing a boundary failure. Keep
					ordinary tests focused on user-visible behavior. Recorded response headers use lowercase
					names, and consumed JSON streams are available as parsed response bodies. Recording
					preserves stream errors and forwards cancellation to the transport. Recorder settlement
					waits for started reads and cancellations. Unread bodies do not block settlement. Finish
					consuming or cancel a started body before awaiting it.
				</p>
			</section>
			<section>
				<h2>Test a server component</h2>
				<CodeBlock source={serverTestingSource} language="ts" title="AccountPage.server.test.ts" />
				<p>
					Import the compiled server component to test its real placement. Server tasks settle
					before the result is captured. State, props, ancestry, and context remain inspectable
					after server cleanup. Stateless parents remain in the tree, and repeated uses of a
					component have distinct identities.
				</p>
				<p>
					Supply application and request context with their matching setup methods. Use
					<code>context()</code> for component-scoped values.
				</p>
			</section>
		</Article>
	);
}
