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
					State changes and event interactions flush reactive rendering and wait for observed
					component tasks. Long-lived work can opt out, while <code>view.flush()</code> and
					<code>view.settle()</code> keep timing choices visible.
				</p>
			</section>
			<section>
				<h2>Inspect the real server component</h2>
				<CodeBlock source={serverTestingSource} language="ts" title="AccountPage.server.test.ts" />
				<p>
					Import the compiled server component to test its real placement. Server tasks settle before
					the result is captured. State, props, ancestry, and context remain inspectable.
				</p>
				<p>
					Supply application and request context with their matching setup methods. Use
					<code>context()</code> for component-scoped values.
				</p>
			</section>
			<section>
				<h2>Test client and server together</h2>
				<p>
					Use <code>mountClientServerTest()</code> to render on the server, hydrate in a test DOM, and
					send task requests to the application&apos;s server handler. Trigger controls through accessible
					queries and assert the resulting page state.
				</p>
				<p>
					The paired view can also report whether hydration adopted existing DOM and whether a server
					response was applied. Use those details when diagnosing a boundary failure; keep ordinary
					tests focused on user-visible behavior.
				</p>
			</section>
		</Article>
	);
}
