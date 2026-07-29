import type { Component } from '@exactjs/core';
import { CodeBlock } from '../CodeBlock.jsx';
import { Article } from './Article.jsx';

const actionSource = `function ProfileEditor(this: Component<ProfileState>) {
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

  return () => (
    <>
      <button disabled={save.pending} onClick={() => void save(readDraft())}>
        {save.pending ? 'Saving…' : 'Save'}
      </button>
      {save.error && <p role="alert">The previous profile was restored.</p>}
    </>
  );
}`;

const formSource = `<Form errors={this.state.errors} onValidSubmit={save}>
  <Field name="email" required>
    <Label>Email</Label>
    <Input type="email" value:input={this.state.email} />
    <FieldError />
  </Field>
  <Submit pendingText="Saving…">Save</Submit>
</Form>`;

/** Documents inferred interactions, explicit actions, optimism, and coordinated forms. */
export function ActionsPage(this: Component<{}>) {
	return () => (
		<Article
			eyebrow="Learn"
			title="Actions coordinate one user intent"
			description="Events, forms, server work, optimistic state, and navigation can share one component-owned lifetime without adding a second state model."
			previous={{ path: '/learn/tasks', label: 'Tasks & cleanup' }}
			next={{ path: '/learn/async-interfaces', label: 'Suspense, Activity & scheduling' }}
		>
			<section>
				<h2>Ordinary callbacks are interactions</h2>
				<p>
					Known DOM events and framework callback positions start an interaction. Synchronous writes
					remain batched, returned promises stay owned by the component, and router work started by
					the callback joins the same settlement. Use an ordinary callback when that inferred
					ownership is enough.
				</p>
			</section>
			<section>
				<h2>Name work when the component needs a handle</h2>
				<p>
					Use <code>this.action()</code> for reactive pending, result, and error status; direct
					invocation; explicit placement or deferred priority; a concurrency policy; or optimistic
					state. <code>parallel</code>, <code>latest</code>, and <code>queue</code> govern accepted
					invocations. Actions are setup resources and are cancelled with their component.
				</p>
				<CodeBlock source={actionSource} language="tsx" title="ProfileEditor.tsx" />
			</section>
			<section>
				<h2>Optimism is an invocation capability</h2>
				<p>
					The final action context supplies <code>optimistic</code>, <code>signal</code>, and a
					generation. An optimistic callback synchronously mutates ordinary component state and
					publishes immediately. Success discards its journal; failure, cancellation, supersession,
					or unmount rolls it back while preserving later authoritative writes. External effects are
					never presented as reversible.
				</p>
			</section>
			<section>
				<h2>Forms keep application state visible</h2>
				<CodeBlock source={formSource} language="tsx" title="AccountForm.tsx" />
				<p>
					The form drops duplicate submissions while active. Busy state, pending text, and submit
					disablement remain until validation, callback work, a placed server action, and joined
					navigation settle. The <code>errors</code> prop projects application-owned validation
					messages into matching fields rather than hiding them in a form store.
				</p>
			</section>
			<section>
				<h2>The compiler keeps distributed actions narrow</h2>
				<p>
					Server actions transport only compiler-approved arguments and captures through opaque
					operation identifiers. Cancellation and invocation generations fence stale commits.
					Events, elements, services, secrets, functions, and action contexts never become payload
					data.
				</p>
				<p>
					Call the typed function returned by <code>this.action.server()</code>, including when its
					return value is needed. Components never acquire the transport client or name a generated
					continuation; server-only action imports remain in the server artifact.
				</p>
			</section>
			<section>
				<h2>Current boundary</h2>
				<p>
					The current delivery coordinates enhanced client forms. Native no-JavaScript action
					endpoints, file-upload transport, partial-prerender resumption, and browser View
					Transition policy remain separate follow-up work.
				</p>
			</section>
		</Article>
	);
}
