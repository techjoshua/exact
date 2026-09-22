import type { Component } from '@exactjs/core';

type Entry = { id: string; comments: { id: string; body: string }[] };
let owner: Component<{ entries: Entry[] }> | undefined;

function OptionalDetail(this: Component<{ busy: boolean }>, props: { entry?: Entry }) {
	this.state.busy = false;
	return () => (
		<section>
			{props.entry ? (
				<>
					<h2>{props.entry.id}</h2>
					<button disabled={this.state.busy} aria-label="Action" />
					<div>
						{props.entry.comments.length === 0 ? <p>No comments</p> : null}
						{props.entry.comments.map((comment) => (
							<p key={comment.id}>{comment.body}</p>
						))}
					</div>
				</>
			) : (
				<p>empty</p>
			)}
		</section>
	);
}

/** Models a selected resource disappearing while its guarded detail list is mounted. */
export function OptionalDetailOwner(this: Component<{ entries: Entry[] }>) {
	owner = this;
	this.state.entries = [{ id: 'selected', comments: [{ id: 'comment', body: 'ready' }] }];
	const selected = this.state.entries.find((entry) => entry.id === 'selected');
	return () => <OptionalDetail entry={selected} />;
}

/** Returns the inspectable owner of the optional-detail fixture. */
export function optionalDetailOwnerInstance() {
	if (!owner) throw new Error('Optional detail owner is not mounted');
	return owner;
}

/** Exercises the same guard through a compiler-indexed state-only update program. */
export function StatefulOptionalDetailOwner(this: Component<{ entries: Entry[] }>) {
	owner = this;
	this.state.entries = [{ id: 'selected', comments: [{ id: 'comment', body: 'ready' }] }];
	return () => (
		<section>
			{this.state.entries[0] ? (
				<>
					<h2>{this.state.entries[0].id}</h2>
					<div>
						{this.state.entries[0].comments.map((comment) => (
							<p key={comment.id}>{comment.body}</p>
						))}
					</div>
				</>
			) : (
				<p>empty</p>
			)}
		</section>
	);
}

/** Supplies the fixture root through a compiled operation for SSR and hydration. */
export const optionalDetailRoot = <OptionalDetailOwner />;
