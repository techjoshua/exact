import testingSource from '../../../../packages/testing/test-fixtures/documentation/Counter.example.tsx?raw';
import counterSource from '../../../../packages/testing/test-fixtures/documentation/Counter.tsx?raw';
import type { Component } from '@exactjs/core';
import { CodeBlock } from '../CodeBlock.jsx';
import { Article } from './Article.jsx';

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
				<CodeBlock source={counterSource} language="tsx" title="Counter.tsx" />
				<CodeBlock source={testingSource} language="ts" title="Counter.test.tsx" />
				<p>
					The test renders a component, finds a control by its role and accessible name, and acts on
					it. Assert the resulting text or state of the control. Queries also support labels,
					visible text, selectors, and test IDs. A query for one element fails if none or several
					match.
				</p>
				<p>
					Find selects by their wrapping or external label, and use the <code>option</code> role to
					inspect their choices. Labelled sections have the <code>region</code> role, and image
					alternative text supplies their accessible name. ARIA names take precedence.
				</p>
				<p>
					When a class is part of the component&apos;s visible state, use
					<code>expect(control).toHaveClass('selected')</code>. The matcher accepts a queried
					control or a DOM element and requires every requested class while allowing additional
					classes. Pass several names or a string containing space-separated names.
				</p>
			</section>
			<section>
				<h2>Define a component beside its test</h2>
				<p>
					A small test fixture can live in the test file. Enable
					<code>{'compiler: { compileTestModules: true }'}</code> in <code>exactVitest()</code> or
					<code>createExactJestConfig()</code> so the compiler transforms its component definitions.
					Test registration remains owned by the runner. The default leaves test files to the runner
					and compiles components imported from ordinary source files.
				</p>
				<p>
					For Bun, configure a project preload with
					<code>{'configureExactBunTest({ compiler: { compileTestModules: true } })'}</code> and
					pass that file to <code>bun test --preload</code>. Supported test filenames end in
					<code>.test</code>, <code>.spec</code>, or <code>.jest</code> before their source
					extension.
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
					Keep SSR render helpers in a fixture module that imports the generated
					<code>.exact.server.js</code> artifact. Vitest, Jest, and Bun select the server projection
					for a helper module with server-owned exports and no component definitions or client-owned
					exports. Client component fixtures in the same suite retain their client projection. A
					module combining component definitions with SSR helpers still needs an explicit target, or
					separate fixture modules.
				</p>
				<p>
					The <code>exactVitest()</code> integration also configures installed eXact packages and
					declared component libraries to share the compiled test&apos;s runtime and export
					conditions. This remains active when automatic matchers are disabled.
				</p>
				<p>
					Generated server artifacts and their library dependencies use server exports in Node and
					jsdom. Choosing a Node test environment alone does not change the default client
					compilation target. To render an authored source component on the server, use a separate
					suite with <code>{"compiler: { target: 'server' }"}</code>, or import its generated server
					artifact. <code>@exact server</code> declares placement and does not select the test
					target.
				</p>
				<p>
					When a test also needs a component’s authored source text, import it with Vite’s
					<code>?raw</code> query alongside the executable import. For example, import
					<code>{'./Probe.js'}</code> for the component and <code>{'./Probe.tsx?raw'}</code> for its
					original source string. This works in client and server test suites. The text import keeps
					its spaces and JSX syntax, while the component import follows normal compilation and
					authorization.
				</p>
				<p>
					Use <code>mountClientServerTest()</code> to render on the server, hydrate in a test DOM,
					and send task requests to the application&apos;s server handler. Trigger controls through
					accessible queries and assert the resulting page state. By default, mount waits for eager
					islands to load and hydrate, and rejects if loading fails. Islands deferred until
					interaction remain dormant until you interact with them.
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
				<h2>Observe progress before a task finishes</h2>
				<p>
					A test that waits for completion can miss a broken progress display. A controlled service
					can report progress and hold the final result until the test is ready to release it.
					Passing <code>settleTasks: false</code> to an interaction lets the test inspect that
					intermediate state.
				</p>
				<CodeBlock
					language="ts"
					title="Observe progress with a controlled test service"
					source={`// The fixture's service exposes report() and finish() controls.
await view.getByRole('button', { name: 'Start' }).click({ settleTasks: false });
await service.started;
service.report({ completed: 3 });
await expect.poll(() => view.getByRole('status').element.textContent).toBe('Completed 3');
service.finish(result);
await view.settle();`}
				/>
				<p>
					For work started during hydration, the same option on <code>mountClientServerTest()</code>
					returns before initial tasks and island loads settle. Wait for the expected control or
					page state before interacting. Complete consumed protocol lines are available in
					<code>view.protocol.exchanges[n].response.events</code> while streaming continues.
					Progress may skip older snapshots, so tests should check meaningful visible states and
					final results. Release held work and call <code>view.unmount()</code> in test cleanup.
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
					The generated factory retains its prop type, so the builder checks required props and
					value types. Generated factory declarations do not expose the authored state type.
					Captured state remains inspectable as a record of unknown values.
				</p>
				<p>
					Supply application and request context with their matching setup methods. Use
					<code>context()</code> for component-scoped values.
				</p>
			</section>
		</Article>
	);
}
