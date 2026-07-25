# @exactjs/testing

Runner-neutral component testing for eXact.

```ts
import { testComponent } from '@exactjs/testing';

const view = await testComponent(Counter).props({ step: 2 }).mount();
await view.getByRole('button').click();
view.unmount();
```

The package provides component mounting, context and props setup, accessible role/text queries,
settled user events, server-render snapshots, in-memory client/server tests, protocol recording,
plugin projections, and matchers for component state, props, context, text, attributes, values,
focus, checked state, disabled state, and mount status.

## Server components

Test the compiler's server artifact, not the unsplit source component:

```ts
import { testServerComponent } from '@exactjs/testing';
import { AccountPage } from '../.exact/AccountPage.exact.server.js';

const view = await testServerComponent(AccountPage)
	.props({ accountId: '42' })
	.applicationContext(Services, services)
	.requestContext(CurrentUser, user)
	.render();

expect(view.html).toContain('Account 42');
expect(view.root.state().loaded).toBe(true);
expect(view.root.find(AccountSummary).context(CurrentUser)).toBe(user);
expect(view.root.providedContext(AccountContext)).toEqual(expectedAccount);
expect(view.resumptions).toEqual(expect.any(Array));
```

`render()` runs and settles server tasks, captures state, props, parent/child ownership, inherited
contexts, and contexts provided by components, then disposes the actual SSR instances. Application
and request context overrides use the same scoped context runtime as a server request. The testing
surface does not use the compiler manifest or expose generated action names.

## Paired client/server tests

Render with hydration enabled, then pair that result with the application's real request handler:

```ts
const server = await testServerComponent(AccountPage)
	.requestContext(CurrentUser, user)
	.render({ hydration: { endpoint: '/__exact' } });

const protocol = new ExactProtocolRecorder();
const runtime = createExactServerRuntime({
	...serverOptions,
	onContextAccess: (observation) => protocol.observeServerContextAccess(observation)
});
const view = await mountClientServerTest({
	server,
	protocol,
	handle: (request) => handleExactRequest(request, runtime),
	islands
});

await view.getByRole('button', { name: 'Save' }).click();

const exchange = view.protocol.exchanges[0];
expect(exchange.operations[0]?.type).toBe('action');
expect(exchange.clientOperations[0]?.patchesApplied).toBe(true);
expect(view.hydration[0]?.outcome).toBe('mounted');
expect(protocol.serverContextAccesses().map(({ token }) => token)).toContain('CurrentUser');
expect(view.component(AccountEditor).providedContext(EditorContext)).toBeDefined();
view.unmount();
```

The paired view hydrates the generated client islands, routes requests through an in-memory
`FetchLike` transport, records request and response envelopes, and records whether returned patches
were applied, rejected, or ignored as stale. `view.hydration` records whether DOM was adopted,
mounted, or updated.

To inspect server context usage without values, create and pass an `ExactProtocolRecorder`, then
wire the server runtime's `onContextAccess` callback to
`protocol.observeServerContextAccess`. Generated operation IDs are deliberately opaque:
trigger behavior through the component and interrogate the observed exchange instead of deriving an
action name from planning metadata.

Most applications should use `@exactjs/vitest` or `@exactjs/jest`, which install the shared
matchers and runner configuration automatically. The `./vitest` and `./jest` entrypoints remain
available for manual integration.
