# Task interactions, optimistic state, and forms

Events, forms, direct calls, and navigation are activation sources for the
same function-defined task model described in [tasks.md](tasks.md). There is no
separate component action resource or registration API.

## Invoked interaction work

Define an ordinary local function and call it from the event, form, or router
host. A final `TaskContext` default declares policy and is erased by the
compiler:

```tsx
function ProfileEditor(this: Component<ProfileState>) {
	async function save(
		profile: Profile,
		task: TaskContext = TaskContext.server().latest().immediate()
	) {
		task.optimistic(() => {
			this.state.profile = profile;
		});
		this.state.profile = await profiles.save(profile, task.signal);
	}

	return () => (
		<form onSubmit={() => save(this.state.profile)}>
			<button disabled={save.pending}>Save</button>
		</form>
	);
}
```

The function is a normal call target. When it is called synchronously by an
event or form callback, it attaches to that interaction's root task frame.
After an `await`, the compiler lowers known task calls through the retained
parent context. A standalone call creates an invoked root.

`parallel()`, `latest()`, and `queue()` select overlap policy for one durable
owner, definition, and optional `key(value)` lane. `immediate()`, `normal()`,
and `deferred()` control scheduling; `blocking()` and `nonblocking()` control
host readiness independently. `detached()` is required when work must not
delay its causal parent.

## Status

Compiler-recognized task functions expose an owner-bound facade when status is
used:

- `pending` and `pendingCount` report foreground work;
- `generation`, `result`, and `error` report accepted terminal generations;
- `cancel(reason?)` cancels represented generations and descendants.

Portable TypeScript uses `taskStatus(save)`. Compilerless libraries define a
task with `defineTask()` and can bind it to an explicit owner with
`bindTask()`.

## Optimistic state

`task.optimistic()` must run synchronously before asynchronous work. Mutate
`this.state` normally. The runtime journals those reactive mutations, commits
them on success, and rolls them back on failure, cancellation, or
supersession. Optimism requires `latest()` or `queue()` so rollback ownership
is deterministic.

Do not author patches, reducers, shadow stores, or manual rollback.

## Forms

Form controls remain package-owned:

- duplicate-submit suppression and pending UI use the root task's foreground
  barrier;
- final errors, cleanup, and optimistic commit or rollback use structural
  settlement;
- native form fallback, external errors, and focus behavior remain ordinary
  form concerns.

The HTML `action` attribute keeps its platform meaning; task unification does
not rename web-platform vocabulary.

## Router work

Navigation, fetch, submit, redirect, and revalidation initiated synchronously
from a task attach to that frame. Standalone navigation creates an interaction
root. Latest-wins navigation and stale response fencing remain router-owned,
while deferred descendants can continue after foreground readiness settles.

## Distributed execution

`TaskContext.server()` lets the compiler generate an allowlisted opaque
operation. Application code calls the task function directly and never
constructs protocol payloads. The current wire version may retain the legacy
`type: "action"` discriminator, but server dispatch normalizes it to neutral
operation semantics and DevTools reports one task tree.
