# Coordinated actions, optimistic state, and forms

## Status

Implemented for the core interaction/action model, coordinated enhanced forms,
optimistic state, router joining, distributed action continuations, inspection,
and TypeScript 6/7 contracts.

| Delivery area                                                          | Current status |
| ---------------------------------------------------------------------- | -------------- |
| Client interaction runtime and DOM ownership                           | Implemented    |
| Named component actions and `parallel` / `latest` / `queue`            | Implemented    |
| Compiler-recognized interaction handlers                               | Implemented    |
| Distributed action continuations and opaque dispatch                   | Implemented    |
| Enhanced forms, external errors, pending UI, and duplicate suppression | Implemented    |
| Path- and collection-aware optimistic journals                         | Implemented    |
| Router navigation, fetch, submit, and revalidation joining             | Implemented    |
| Immutable action inspection and TypeScript 6/7 contracts               | Implemented    |
| Native no-JavaScript endpoints and file-upload transport               | Deferred       |
| Partial-prerender resumption and browser View Transition policy        | Deferred       |

The first delivery intentionally diagnoses parallel optimistic overlays and
defers native no-JavaScript action endpoints, file-upload transport,
partial-prerender resumption, and browser View Transition policy. Those
features require separate transport and browser-lifecycle contracts; they are
not silently approximated by the enhanced action runtime.

Current behavior is documented in
[`../actions-and-forms.md`](../actions-and-forms.md),
[`../component-language.md`](../component-language.md), and the package
READMEs. This document remains as the design rationale and verification
inventory; future-tense delivery sections below record the original plan and
are not a claim that implemented phases remain pending.

## Decision

Do not introduce a public general-purpose transition object or a Hook-shaped
action API.

Use three concepts:

1. An **interaction** is an internal execution scope created when a known DOM
   event, form, navigation, or explicit action callback runs.
2. An **action** is the optional explicit, named, component-owned form of an
   interaction. It is declared with `this.action(name, work, concurrency?)`.
3. An **optimistic block** is a synchronous state overlay declared through the
   compiler-provided final `ActionContext` argument. Optimism is not a method on
   `Component` because it is meaningful only while one action generation is
   active.

Ordinary form and event code remains inference-first:

```tsx
async function save(_event: SubmitEvent, data: FormData) {
	this.state.profile = await profiles.save(readProfile(data));
}

return () => <Form onValidSubmit={save}>...</Form>;
```

An author introduces an explicit action only when status, invocation policy,
opaque placement, direct invocation, or optimistic state is needed:

```tsx
const save = this.action(
	'save profile',
	async (profile: Profile, { optimistic }) => {
		optimistic(() => {
			this.state.profile = profile;
		});

		this.state.profile = await profiles.save(profile);
	},
	'latest'
);
```

Authored action names are diagnostic labels, not protocol identity. Server
dispatch, hydration, allowlisting, and cross-build validation continue to use
opaque compiler-generated identifiers.

## Why this belongs in eXact

eXact already has most of the required machinery:

- DOM handlers run inside a reactive batch and promise-like results are
  observed by the owning component.
- Component tasks have generations, cancellation, cleanup, placement,
  scheduling priority, and readiness policy.
- Blocking task mutations can be staged, committed, or discarded.
- Distributed continuations transport compiler-approved dependencies and
  return only compiler-approved state, context, and DOM effects.
- `@exactjs/forms` owns validation ordering, submission state, accessibility
  relationships, and focus behavior.
- The router already owns navigation and fetcher generations, cancellation,
  stale-result rejection, redirects, and revalidation.

The missing concept is one invocation lifetime that coordinates those systems.
That lifetime should be inferred from existing callback flow wherever possible.
It should not require application authors to reproduce transport, abort,
pending, rollback, or navigation plumbing.

## Goals

- Preserve ordinary TypeScript callbacks as the common authoring form.
- Infer component ownership, pending settlement, cancellation, placement,
  captures, and returned state effects from known interaction positions.
- Make explicit actions durable, named, inspectable component resources.
- Keep direct `this.state` mutation as the only component-state model.
- Provide optimistic state without reducers, immutable replacement, authored
  patches, or manual rollback.
- Coordinate forms, server work, navigation, Suspense, Activity, and eventual
  View Transitions through one invocation lifetime.
- Preserve native forms and support no-JavaScript submission where the compiler
  can prove a safe server action.
- Keep server operation identifiers opaque and enforce all current placement,
  serialization, authorization, secret, build, and stale-generation checks.
- Make every terminal state release cancellation, optimistic, form, navigation,
  and resource ownership deterministically.

## Non-goals

- React Hooks, render-phase actions, or positional action state.
- A second application state store hidden behind an action dispatcher.
- Inferring optimistic intent from writes before an `await`.
- Treating external effects as reversible.
- Making arbitrary callbacks server-callable.
- Transporting DOM events, elements, `FormData`, services, functions, or
  `ActionContext` objects.
- Using authored action names as public endpoints or security identifiers.
- Reproducing React Fiber transition internals or private form protocols.
- Supporting overlapping parallel optimistic overlays in the first delivery.

## Public authoring contract

### Action concurrency

```ts
export type ActionConcurrency = 'parallel' | 'latest' | 'queue';
```

- `parallel` permits every accepted invocation to settle and commit.
- `latest` cancels and generation-fences the previous invocation.
- `queue` executes accepted invocations in call order.

The default for an explicit action is `parallel`, which preserves ordinary
JavaScript call semantics. A host may impose a different interaction policy:
forms drop duplicate submissions while submitting, and router navigation uses
latest-wins behavior.

### Action context

```ts
export type ActionContext = {
	/**
	 * Aborts when this invocation is cancelled, superseded, or disposed with
	 * its owning component.
	 */
	readonly signal: AbortSignal;

	/** Monotonically increasing generation within this component action. */
	readonly generation: number;

	/**
	 * Immediately publishes rollback-capable component-state mutations owned
	 * by this action generation.
	 */
	optimistic(work: () => void): void;
};
```

The context is supplied by the framework as the final argument to explicit
action work. It is not part of the returned callable's arguments and never
crosses a client/server boundary.

### Callable action

```ts
export type ComponentAction<Args extends readonly unknown[], Result> = {
	(...args: Args): Promise<Result>;

	readonly pending: boolean;
	readonly pendingCount: number;
	readonly generation: number;
	readonly result: Result | undefined;
	readonly error: unknown;

	cancel(reason?: unknown): void;
};
```

Status properties are reactive. `pendingCount` is meaningful for parallel
actions. Cancellation is not an application error and does not populate
`error`.

Starting a new accepted generation clears the error for the affected action
key but retains the last successful result until another generation succeeds.
This gives pending interfaces a stable prior result without inventing a
separate stale-data abstraction.

### Action registration

The intended source surface is:

```ts
this.action(name, work);
this.action(name, work, concurrency);

this.action.client(name, work, concurrency);
this.action.server(name, work, concurrency);
this.action.deferred(name, work, concurrency);
this.action.server.deferred(name, work, concurrency);
```

Conceptually:

```ts
export type ComponentActionRegistration = {
	<Args extends readonly unknown[], Result>(
		name: string,
		work: (...args: Args) => Result | PromiseLike<Result>,
		concurrency?: ActionConcurrency
	): ComponentAction<Args, Awaited<Result>>;

	<Args extends readonly unknown[], Result>(
		name: string,
		work: (...args: [...Args, ActionContext]) => Result | PromiseLike<Result>,
		concurrency?: ActionConcurrency
	): ComponentAction<Args, Awaited<Result>>;

	readonly deferred: ComponentActionRegistration;
};

export type ComponentActionFactory = ComponentActionRegistration & {
	readonly client: ComponentActionRegistration;
	readonly server: ComponentActionRegistration;
};
```

The final declarations must be selected through TypeScript 6 and TypeScript 7
type fixtures. Tuple inference must prove that the injected context is excluded
from the callable arguments and that context-free callbacks remain ergonomic.

### Component contract

`Component` gains only the action registrar:

```ts
export interface Component<State extends object> {
	state: Reactive<State>;
	task: ComponentTask;
	action: ComponentActionFactory;
	// Existing context, ref, lifecycle, map, reactive, and logging APIs.
}
```

There is deliberately no `this.optimistic()`. Optimism is an invocation
capability and belongs on `ActionContext`.

## Inferred interactions

The compiler recognizes a callback as an interaction when it flows directly
into a framework-known interaction position. Recognition is based on
contextual type identity, not a prop name such as `onSubmit`.

Conceptually, eXact provides a compiler-recognized type:

```ts
declare const interactionHandler: unique symbol;

export type InteractionHandler<Args extends readonly unknown[]> = {
	(...args: Args): unknown;
	readonly [interactionHandler]?: true;
};
```

Intrinsic JSX event handlers and framework-owned interaction props use that
contract. `@exactjs/forms` can therefore declare:

```ts
export type FormProps = {
	children?: Child | Child[];
	errors?: Readonly<Record<string, string | readonly string[] | undefined>>;
	onSubmit?: InteractionHandler<[event: SubmitEvent]>;
	onValidSubmit?: InteractionHandler<[event: SubmitEvent, data: FormData]>;
	onInvalidSubmit?: InteractionHandler<[event: SubmitEvent]>;
};
```

The compiler follows safe local aliases and transparent wrappers. An opaque
third-party callback registry does not become an interaction merely because a
callback returns a promise. Use `this.action()` when ownership cannot be
proven.

Inferred handlers receive an internal interaction scope but do not initially
receive a source-visible `ActionContext`. Requiring explicit action
registration when optimism is needed is intentional: rollback changes state
semantics and should be visible in source.

## Complete component examples

### Inferred server form with validation

```tsx
import { createContext, type Component } from '@exactjs/core';
import { Field, FieldError, FieldHelp, Form, Input, Label, Submit } from '@exactjs/forms';

type Profile = {
	name: string;
	email: string;
};

type ProfileErrors = Partial<Record<keyof Profile | 'form', string>>;

type ProfileState = {
	profile: Profile;
	errors: ProfileErrors;
	saved: boolean;
};

type SaveProfileResult =
	| {
			ok: true;
			profile: Profile;
	  }
	| {
			ok: false;
			errors: ProfileErrors;
	  };

interface ProfileRepository {
	/** @exact shared */
	save(profile: Profile): Promise<SaveProfileResult>;
}

const Profiles = createContext<ProfileRepository>('profiles', {
	scope: 'request',
	reactive: false,
	keep: 'server'
});

export function ProfileEditor(this: Component<ProfileState>) {
	const profiles = this.getContext(Profiles);

	this.state.profile = {
		name: '',
		email: ''
	};
	this.state.errors = {};
	this.state.saved = false;

	async function save(_event: SubmitEvent, data: FormData) {
		const input: Profile = {
			name: String(data.get('name') ?? ''),
			email: String(data.get('email') ?? '')
		};

		const result = await profiles.save(input);

		if (!result.ok) {
			this.state.errors = result.errors;
			this.state.saved = false;
			return;
		}

		this.state.profile = result.profile;
		this.state.errors = {};
		this.state.saved = true;
	}

	return () => (
		<section aria-labelledby="profile-heading">
			<h1 id="profile-heading">Profile</h1>

			<Form errors={this.state.errors} onValidSubmit={save}>
				<Field
					name="name"
					required
					validate={(value) => String(value).trim().length > 0 || 'Enter your name'}
				>
					<Label>Name</Label>
					<Input value:input={this.state.profile.name} autoComplete="name" />
					<FieldError />
				</Field>

				<Field
					name="email"
					required
					validate={(value) => String(value).includes('@') || 'Enter a valid email'}
				>
					<Label>Email</Label>
					<Input type="email" value:input={this.state.profile.email} autoComplete="email" />
					<FieldHelp>Used for account notifications.</FieldHelp>
					<FieldError />
				</Field>

				{this.state.errors.form && <p role="alert">{this.state.errors.form}</p>}

				<Submit pendingText="Saving…">Save profile</Submit>

				{this.state.saved && <p role="status">Profile saved.</p>}
			</Form>
		</section>
	);
}
```

The compiler recognizes `save` through `onValidSubmit`, infers server
placement from `Profiles`, transports only the permitted input projection, and
returns only the declared state effects. The form owns pending presentation
and validation focus. Expected server validation remains ordinary,
inspectable component state.

### Explicit latest-wins search

```tsx
import { createContext, type Component } from '@exactjs/core';

type SearchResult = {
	id: string;
	title: string;
};

type SearchState = {
	query: string;
	results: SearchResult[];
};

interface Catalog {
	/** @exact shared */
	search(query: string): Promise<SearchResult[]>;
}

const CatalogContext = createContext<Catalog>('catalog', {
	scope: 'request',
	reactive: false,
	keep: 'server'
});

export function ProductSearch(this: Component<SearchState>) {
	const catalog = this.getContext(CatalogContext);

	this.state.query = '';
	this.state.results = [];

	const search = this.action.deferred(
		'search products',
		async (query: string) => {
			if (!query.trim()) {
				this.state.results = [];
				return [];
			}

			const results = await catalog.search(query);
			this.state.results = results;
			return results;
		},
		'latest'
	);

	function updateQuery(event: InputEvent) {
		const input = event.currentTarget as HTMLInputElement;
		this.state.query = input.value;
		void search(input.value);
	}

	return () => (
		<section aria-labelledby="search-heading">
			<h1 id="search-heading">Products</h1>

			<label>
				Search
				<input
					type="search"
					value={this.state.query}
					onInput={updateQuery}
					aria-describedby="search-status"
				/>
			</label>

			<p id="search-status" role="status">
				{search.pending ? 'Searching…' : `${this.state.results.length} results`}
			</p>

			{search.error && <p role="alert">Search failed: {String(search.error)}</p>}

			<ul>
				{this.state.results.map((result) => (
					<li key={result.id}>{result.title}</li>
				))}
			</ul>
		</section>
	);
}
```

The action is explicit because the component reads its status and requests
latest-wins concurrency. A newer query aborts the previous generation, and a
stale response cannot commit.

### Optimistic todo update

```tsx
import { createContext, peek, type Component } from '@exactjs/core';

type Todo = {
	id: string;
	title: string;
	complete: boolean;
};

type TodoItemState = {
	todo: Todo;
};

type TodoItemProps = {
	todo: Todo;
};

interface TodoRepository {
	/** @exact shared */
	setComplete(id: string, complete: boolean, options?: { signal?: AbortSignal }): Promise<Todo>;
}

const Todos = createContext<TodoRepository>('todos', {
	scope: 'request',
	reactive: false,
	keep: 'server'
});

export function TodoItem(this: Component<TodoItemState>, props: TodoItemProps) {
	const todos = this.getContext(Todos);

	// This is deliberately local editable state rather than a derived prop mirror.
	this.state.todo = peek(() => props.todo);

	const setComplete = this.action(
		'set todo completion',
		async (complete: boolean, { optimistic, signal }) => {
			optimistic(() => {
				this.state.todo.complete = complete;
			});

			const confirmed = await todos.setComplete(this.state.todo.id, complete, {
				signal
			});

			this.state.todo = confirmed;
		},
		'latest'
	);

	return () => (
		<li>
			<label>
				<input
					type="checkbox"
					checked={this.state.todo.complete}
					disabled={setComplete.pending}
					onChange={(event) => {
						void setComplete(event.currentTarget.checked);
					}}
				/>

				<span>{this.state.todo.title}</span>
			</label>

			{setComplete.error && (
				<span role="alert">Could not update this item. The previous value was restored.</span>
			)}
		</li>
	);
}
```

The optimistic mutation publishes immediately. The returned server value
updates authoritative state beneath the overlay. Success removes the overlay
and reveals the confirmed value; failure, cancellation, supersession, or
unmount removes it and reveals the prior authoritative value.

### Form action followed by navigation

```tsx
import { createContext, type Component } from '@exactjs/core';
import { Field, FieldError, Form, Input, Label, Submit } from '@exactjs/forms';
import { RouterContext } from '@exactjs/router';

type Project = {
	id: string;
	name: string;
};

type CreateProjectState = {
	name: string;
	error?: string;
};

interface ProjectRepository {
	/** @exact shared */
	create(input: { name: string }): Promise<Project>;
}

const Projects = createContext<ProjectRepository>('projects', {
	scope: 'request',
	reactive: false,
	keep: 'server'
});

export function CreateProject(this: Component<CreateProjectState>) {
	const projects = this.getContext(Projects);
	const router = this.getContext(RouterContext);

	this.state.name = '';
	this.state.error = undefined;

	async function createProject(_event: SubmitEvent, data: FormData) {
		this.state.error = undefined;

		const project = await projects.create({
			name: String(data.get('name') ?? '')
		});

		await router.navigate(`/projects/${project.id}`);
	}

	return () => (
		<main>
			<h1>Create project</h1>

			<Form onValidSubmit={createProject}>
				<Field
					name="name"
					required
					validate={(value) => String(value).trim().length >= 3 || 'Use at least three characters'}
				>
					<Label>Project name</Label>
					<Input value:input={this.state.name} />
					<FieldError />
				</Field>

				{this.state.error && <p role="alert">{this.state.error}</p>}

				<Submit pendingText="Creating…">Create project</Submit>
			</Form>
		</main>
	);
}
```

Navigation joins the current interaction. The form remains pending through
validation, server settlement, state effects, route loading, and navigation
commit. A completed external creation is not automatically reversed if later
navigation fails.

## Runtime interaction model

The core runtime owns an internal interaction state machine:

```ts
type InteractionScope = {
	readonly id: number;
	readonly owner: ComponentInstance<any>;
	readonly source: 'event' | 'form' | 'action' | 'navigation';
	readonly controller: AbortController;
	readonly priority: 'interactive' | 'normal' | 'deferred';
	readonly generation: number;
	readonly parent?: InteractionScope;

	phase: 'running' | 'settling' | 'succeeded' | 'failed' | 'cancelled';
	settlements: Set<PromiseLike<unknown>>;
	optimistic?: OptimisticOverlay;
};
```

The scope owns cancellation, settlement aggregation, error routing, priority,
optimistic overlays, nested router/server work, and status publication to an
explicit action or interaction host.

DOM event delivery replaces direct promise observation with one operation that
runs the handler in a component interaction. Synchronous state writes remain
batched exactly as they are today.

Browsers do not provide a portable async-local context. Do not patch global
promises. The compiler should lower action-owned awaits through an
`interactionAwait()` operation that races cancellation, rejects stale
generations, and restores the current interaction while the continuation
resumes. This is analogous to existing task-await lowering.

## Action-context rules

- `ActionContext` exists only while its generation is active.
- The runtime constructs it and supplies it as the final work argument.
- The context is excluded from the callable action's public argument tuple.
- It cannot be stored in state or context, returned, serialized, or captured
  by longer-lived work.
- Known cancellable APIs continue to receive `signal` automatically.
- The explicit `signal` remains available for opaque APIs.
- Use after cancellation reports a development error; compiler-generated stale
  continuation checks prevent normal stale code from reaching it.

## Optimistic-state rules

- `optimistic()` accepts a synchronous callback only.
- The callback may mutate only state owned by the action's component instance.
- It cannot mutate props or component context.
- It cannot start async work or acquire resources.
- Multiple calls in one generation merge into that generation's overlay.
- The supported write forms match ordinary compiler-observable state writes.
- Secret or server-resident data cannot enter a client optimistic overlay.
- Initial support is limited to `latest` and `queue` actions.
- `parallel` optimistic actions are diagnosed until path-granular overlay
  rebasing has independent invariant coverage.

The authoritative component state remains beneath the overlay. Rendering reads
the effective overlaid value. Server or client authoritative results update the
base state. Removing the overlay then exposes the newest authoritative value.

External effects are never rolled back. An optimistic action that creates a
record remotely cannot undo that creation merely because a later navigation
failed.

## Forms integration

`@exactjs/forms` should remain an accessibility and validation coordinator, not
a second data store.

Proposed additions:

```ts
export type FormProps = {
	// Existing properties.
	errors?: Readonly<Record<string, string | readonly string[] | undefined>>;
};

export type SubmitProps = Record<string, unknown> & {
	children?: Child | Child[];
	pendingText?: Child;
};
```

The form context gains reactive submission state used by a native `Submit`
component. The form:

- validates before invoking the handler;
- remains submitting through all joined interaction settlement;
- drops duplicate submission while already submitting;
- maps application-owned external errors to fields by name;
- focuses the first invalid field;
- applies `aria-busy` and accessible pending presentation;
- preserves native controls and browser validation behavior; and
- routes unexpected errors through normal component error ownership.

Expected server validation remains ordinary returned data assigned to
component state. Do not create a hidden form-error store or magic action return
shape.

## Router integration

Router operations join the current interaction when one exists. Otherwise the
router creates its normal navigation interaction.

- The parent interaction remains pending until route loaders and commit settle.
- Newer navigation supersedes the previous navigation generation.
- Redirects remain router results.
- Navigation failure belongs to the interaction's error owner.
- Already completed external effects are not rolled back.
- A later View Transition option should wrap the navigation commit, not
  arbitrary action execution.

## Compiler and continuation changes

Extend the existing continuation model rather than introducing another RPC
architecture:

```ts
export type ExactContinuationIR = {
	// Existing fields.
	kind: 'task' | 'action';

	invocation?: {
		arguments: ExactArgumentEffect[];
		concurrency: ActionConcurrency;
		progressiveForm?: ExactProgressiveFormIR;
	};

	ownership: {
		componentId: string;
		lifetime: 'component' | 'invocation';
	};
};
```

Action activation records include component instance identity, opaque
continuation identity, invocation generation, compiler-approved argument
projections, state captures, public context captures, build identity, and
staleness identity.

Responses contain only validated state/context effects, permitted DOM patches,
and explicit redirect/navigation results. DOM events, elements, `FormData`,
request objects, services, functions, repositories, and `ActionContext` never
cross directly.

For an optimistic distributed action, lowering has three stages:

```text
client prelude
├─ create action generation
├─ create ActionContext
├─ install optimistic overlay
└─ dispatch server continuation

server continuation
├─ resolve server-owned contexts
├─ perform authoritative work
└─ return compiler-approved effects

client settlement
├─ apply authoritative effects beneath the overlay
├─ remove the overlay
├─ publish action status
└─ dispose generation ownership
```

Explicit `.server` placement permits the compiler-owned optimistic client
prelude, but it does not permit arbitrary authored browser effects in the
server portion.

## Progressive native forms

Progressive enhancement follows the enhanced action implementation rather than
landing simultaneously with the first action runtime.

For a statically recognized server-capable form, SSR may emit a real `method`
and generated `action`. Framework-owned hidden fields carry only validated
build, component activation, CSRF, and opaque continuation information. They
never contain module paths, export names, services, contexts, or credentials.

The no-JavaScript endpoint:

1. validates body limits, content type, build identity, CSRF, and allowlisting;
2. reconstructs only the permitted server continuation;
3. runs validation and authoritative action work;
4. returns a redirect using POST/Redirect/GET where appropriate; and
5. otherwise rerenders the authoritative boundary or document.

Optimistic blocks are client-only presentation. A no-JavaScript submission
skips them and performs the authoritative operation. The compiler diagnoses a
progressive action whose only meaningful visible state write is optimistic.

Initial transport supports string fields and repeated string fields. File
uploads require a separate streaming design with explicit count, size, type,
cancellation, and storage-lifetime policy.

## Diagnostics

The compiler should report:

- an interaction callback that carries a DOM event or element across server
  placement;
- a `FormData` capture without a supported field projection;
- non-serializable action arguments or results;
- client placement reaching server-only effects;
- server placement reaching browser-only effects outside the compiler-owned
  optimistic prelude;
- `ActionContext` escaping into state, context, a return value, or longer-lived
  work;
- an async optimistic callback;
- optimism outside an explicit action;
- optimistic mutation of props, context, or reflective state;
- parallel optimistic concurrency before rebasing is supported;
- action registration outside direct component setup;
- action registration or invocation during render;
- a known interaction handler escaping through an opaque callback boundary;
- progressive forms with unsupported file or dynamic-field behavior; and
- secret-derived data reaching public arguments, optimistic state, returned
  effects, HTML, hydration, or diagnostics.

Diagnostics should identify the interaction source, offending value or
operation, inferred placement, and supported explicit alternative.

## Package ownership

### `@exactjs/core`

Owns public action contracts, action registration, the interaction state
machine, generation/concurrency behavior, optimistic overlays, component
disposal, error ownership, and private compiler markers.

Implementation modules should each own one domain concept, for example:

```text
component/action-contracts.ts
component/action-api.ts
interaction/execution.ts
interaction/concurrency.ts
interaction/optimistic-state.ts
interaction/continuation.ts
```

### `@exactjs/compiler`

Owns contextual interaction recognition, callback provenance, deferred
callback analysis, placement and capture analysis, action continuation IR,
await lowering, optimistic validation, progressive-form planning, and explain
output.

### `@exactjs/dom`

Owns DOM-event interaction creation, host settlement observation, event
lifetime, and focus preservation. It does not own concurrency or optimistic
semantics.

### `@exactjs/forms`

Owns validation sequencing, duplicate submission policy, form status context,
external field-error projection, focus/accessibility behavior, and progressive
form host metadata.

### `@exactjs/router`

Owns navigation joining, navigation supersession, route readiness, redirects,
and View Transition coordination.

### Server, SSR, and hydration packages

Own validated action dispatch, invocation generation fencing, standard-form
request handling, SSR action metadata, enhanced activation, redirect/patch
responses, and request cancellation.

## Delivery plan

### Phase 1: client interaction runtime

- Add the internal interaction scope.
- Move DOM event promise observation through that scope.
- Implement cancellation, settlement aggregation, generation fencing, error
  ownership, and component disposal.
- Preserve current synchronous event batching.

### Phase 2: explicit named actions

- Add `this.action(name, work, concurrency?)`.
- Add reactive status and cancellation.
- Add `parallel`, `latest`, and `queue`.
- Add client, server, and deferred facets.
- Supply the final `ActionContext`.
- Add TypeScript 6 and TypeScript 7 declaration fixtures.

### Phase 3: inferred interactions

- Add compiler-recognized interaction-handler contextual types.
- Recognize intrinsic events and forms callbacks.
- Follow aliases and transparent local wrappers.
- Lower awaits so action context and stale-generation checks survive
  continuation resumption.
- Add component-organized explain output.

### Phase 4: distributed actions

- Extend continuation IR with action kind and invocation arguments.
- Emit matching client/server artifacts.
- Validate captures, effects, build identity, and stale generations.
- Compose server authority from executable component contracts.
- Add paired client/server testing without exposing generated IDs.

### Phase 5: coordinated forms

- Make form submission an interaction host.
- Add reactive form status and `Submit`.
- Add external field-error projection.
- Preserve focus, accessibility, and duplicate-submission behavior.
- Keep the form pending through joined action settlement.

### Phase 6: optimistic overlays

- Add `ActionContext.optimistic()`.
- Support one overlay per `latest` or `queue` generation.
- Support ordinary deep object, array, `Map`, and `Set` writes.
- Rebase authoritative updates beneath an overlay.
- Roll back on failure, cancellation, supersession, and unmount.
- Emit inspector events for overlay creation, paths, settlement, and removal.

### Phase 7: router coordination

- Join navigation to an active interaction.
- Keep form/action status pending through route readiness and commit.
- Preserve router supersession, redirects, blockers, and revalidation.
- Add explicit browser View Transition coordination after commit ownership is
  proven.

### Phase 8: progressive forms

- Emit native form method/action metadata.
- Validate CSRF, body limits, build identity, and allowlisting.
- Support POST/Redirect/GET and authoritative rerender responses.
- Skip optimistic presentation on no-JavaScript execution.
- Design file uploads separately.

### Phase 9: inspection and stabilization

- Expose action names, generations, placement, status, captures, cancellation
  reasons, optimistic paths, and joined form/router work.
- Measure retained state, scheduling, compiler time, and client output.
- Update current component, form, router, SSR, hydration, server, testing, and
  instrumentation references when behavior lands.
- Delete or reduce this proposal so implemented behavior is not documented as
  future work.

## Verification

### Core state-machine tests

Protect parallel/latest/queue ordering, cancellation, cleanup, status
transitions, nested settlement, unmount, and exactly-once error reporting.

### Compiler semantic tests

Protect contextual recognition, aliases, wrappers, async control flow,
`try`/`catch`/`finally`, placement, argument projection, state effects,
unsupported captures, secret rejection, and action-context escape.

Prefer semantic IR and diagnostic assertions over exact generated-text
snapshots.

### Optimistic invariant tests

Protect success, failure, cancellation, supersession, unmount, deep mutation,
collection mutation, multiple blocks in one generation, authoritative updates
beneath an overlay, and absence of retained overlays after every terminal
state.

Property-based mutation sequences are justified because overlay rebasing is a
high-risk state machine.

### DOM and form integration tests

Protect native/delegated events, returned promise observation, duplicate
submission, validation ordering, `aria-busy`, submit disabling, field errors,
focus, and unmount during validation or submission.

### Distributed tests

Compile real client and server artifacts, exercise opaque dispatch through an
in-memory handler, and verify cancellation, stale rejection, invalid
arguments/effects, context isolation, redirects, navigation joining, and
hydration.

### Security tests

Protect unknown operation IDs, cross-build activation, CSRF failure, oversized
bodies, unexpected fields, prototype-bearing input, secret-derived output,
cross-component replay, and file-policy rejection.

### Acceptance applications

Use a small number of vertical slices:

1. inferred profile form with server validation;
2. latest-wins search;
3. optimistic todo;
4. create-and-navigate form;
5. no-JavaScript submission; and
6. cancellation during route replacement.

## Open questions

- The exact overload ordering or branded type shape needed for reliable
  context-parameter inference across TypeScript 6 and TypeScript 7.
- Whether action labels must be compile-time string literals or whether a
  stable module constant is also accepted.
- Whether duplicate action labels within one component are permitted with
  source-location disambiguation or diagnosed for clearer inspection.
- The eventual keyed-concurrency API for independent record mutations.
- The path-level ordering rules required before parallel optimistic overlays
  are supported.
- The precise standard-form activation envelope and redirect/rerender response
  contract.
- File upload streaming, limits, storage lifetime, and cancellation.
- The minimal View Transition API after form and router settlement ownership
  is implemented.

These questions do not reopen the central authoring decisions: inference is the
default, explicit work is named with `this.action(name, work, concurrency?)`,
and optimistic mutation is available only through the final
compiler-provided `ActionContext`.
