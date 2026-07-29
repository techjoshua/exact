# Actions, interactions, optimistic state, and forms

This document describes the implemented coordinated-work model. The original
design rationale and delivery inventory remain in
[`proposals/coordinated-actions-and-forms.md`](proposals/coordinated-actions-and-forms.md).

## Choose inferred or explicit work

Known DOM events and framework callback positions are interaction hosts. Their
synchronous state writes batch together, returned promises remain owned by the
component, and router work started synchronously joins the same settlement.
Ordinary callbacks need no wrapper:

```tsx
async function save(_event: SubmitEvent, data: FormData) {
	this.state.profile = await profiles.save(readProfile(data));
	await router.navigate('/profile');
}

return () => <Form onValidSubmit={save}>...</Form>;
```

Use an explicit component action when the component needs a named and
inspectable operation, a concurrency policy, explicit placement or priority,
direct invocation, or optimistic state:

```tsx
const save = this.action.server(
	'save profile',
	async (profile: Profile, { optimistic, signal }) => {
		optimistic(() => {
			this.state.profile = profile;
		});
		this.state.profile = await profiles.save(profile, { signal });
	},
	'latest'
);
```

The action name is a diagnostic label. Compiler-generated opaque identifiers,
not authored names, secure distributed dispatch.

## Action lifetime

`parallel`, `latest`, and `queue` are the supported concurrency policies.
Every accepted invocation has an abort signal and generation. The returned
callable exposes reactive `pending`, `pendingCount`, `generation`, `result`,
and `error` properties plus `cancel()`.

Placement and priority facets compose:

```ts
this.action(name, work, policy);
this.action.client(name, work, policy);
this.action.server(name, work, policy);
this.action.deferred(name, work, policy);
this.action.server.deferred(name, work, policy);
```

Actions are setup-owned component resources. Unmount cancels queued and active
generations and releases their optimistic journals. Synchronous failures and
asynchronous rejections follow the same status and error-ownership rules.
`inspectComponentActions()` returns immutable diagnostic snapshots without
exposing work callbacks or operation identifiers.

## Optimistic state

`optimistic()` accepts a synchronous callback and publishes ordinary
`this.state` mutations immediately. The reactive runtime journals the affected
object paths, array sequences, Map entries, and Set memberships.

Success discards the journal. Failure, cancellation, supersession, or unmount
rolls it back. Rollback preserves later authoritative writes, including writes
that overlap a different Map key, Set member, object path, or compatible array
segment. External effects are never treated as reversible.

Parallel optimistic actions are diagnosed in this delivery because overlapping
overlay composition is not yet a supported contract.

## Coordinated forms

`@exactjs/forms` keeps application values and server validation errors in
inspectable component state:

```tsx
<Form errors={this.state.errors} onValidSubmit={save}>
	<Field name="email" required>
		<Label>Email</Label>
		<Input type="email" value:input={this.state.email} />
		<FieldError />
	</Field>
	<Submit pendingText="Saving…">Save</Submit>
</Form>
```

The form drops duplicate submissions while one is active. `aria-busy`, submit
disablement, and pending text remain active until validation, callback work,
server continuations, and joined navigation settle. The `errors` prop maps
application-owned messages to fields; it does not create a second form store.

## Distributed actions

The compiler lowers placed actions into the existing continuation protocol.
Only declared argument slots and approved captures cross the boundary.
Request cancellation and the invocation generation reach the server executor;
the authored return value comes back through the validated continuation
envelope with its TypeScript type preserved at the component call site. Stale
generations cannot commit.

Application code calls the typed function returned by `this.action.server()`.
It does not acquire the low-level transport client, call `invokeAction()`, or
name a generated continuation. Server-only imports used by the action body stay
in the server artifact; the client artifact contains only an opaque compiler
dispatch stub.

Action contexts, DOM events, elements, functions, services, secrets, and raw
`FormData` are not transport values. Server endpoints retain allowlisting,
authorization, CSRF, payload, serialization, and build-identity validation.

## Current limits

The implemented enhanced-client model does not yet include native
no-JavaScript action endpoints, file-upload transport, partial-prerender
resumption, or browser View Transition policy. Those need distinct transport
and browser-lifecycle contracts and are tracked as deferred proposal work.
