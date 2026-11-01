import { publishScalar, publishAsyncScalar } from './state-publication-helper.js';
import { TaskContext, type Component } from '@exactjs/core';
import { defineTask, type TaskOwner } from '@exactjs/core/tasks';

/** Supplies a bundled public task for binding through another compatible provider. */
export function publicationTask(owner: TaskOwner) {
	return defineTask<[number], number>({ owner, concurrency: 'queue' }, async (value) => value);
}

let publicationResourceReleases = 0;
class PublicationResource {
	dispose(): void {
		publicationResourceReleases++;
	}
}
/** Counts completed task-owned cleanup for adapter lifetime assertions. */
export function releasedPublicationResources(): number {
	return publicationResourceReleases;
}

type PublicationState = {
	label?: string;
	nested: { value: string; sibling?: string };
	rows: string[];
	lookup: Map<string, number>;
};

/** Exercises selected values, complete snapshots, and owned collection work in one compiler-owned invocation. */
export function StatePublicationProbe(this: Component<PublicationState>, props: { mode: string }) {
	this.state.label = 'before';
	this.state.nested = { value: 'before', sibling: 'keep' };
	this.state.rows = ['a', 'b', 'c'];
	this.state.lookup = new Map();
	const mode = props.mode;
	// The compiler consumes these policy parameters without an authored capability call.
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	const child = async (task: TaskContext = TaskContext.server()) => {
		this.state.lookup.set('child', 1);
	};
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	const childDelete = async (task: TaskContext = TaskContext.server()) => {
		delete this.state.label;
	};
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	const update = async (task: TaskContext = TaskContext.server()) => {
		const resource = new PublicationResource();
		void resource;
		await Promise.resolve();
		const previous = this.state.label;
		const owner = this;
		const calls = {
			put() {
				owner.state.nested.value = 'after';
			}
		};
		if (mode === 'assign') this.state.label = previous;
		else if (mode === 'undefined') this.state.label = undefined;
		else if (mode === 'delete') delete this.state.label;
		else if (mode === 'array-delete') delete this.state.rows[1];
		else if (mode === 'child-delete') await childDelete();
		else if (mode === 'array') this.state.rows.push('d');
		else if (mode === 'child') this.state.nested.value = 'after';
		else if (mode === 'detached-child') {
			async function detachedChild(
				childTask: TaskContext = TaskContext.server().detached().blocking()
			) {
				await Promise.resolve();
				if (!childTask.signal.aborted) owner.state.label = 'after';
				return owner.state.label;
			}
			const launch = async () => await detachedChild();
			await launch();
		} else if (mode === 'local-method') {
			calls.put();
		} else if (mode === 'local-async-closure') {
			const owner = this;
			const put = async () => {
				owner.state.nested.value = 'before';
				await Promise.resolve();
				owner.state.nested.value = 'after';
			};
			await put();
		} else if (mode === 'scalar-helper') publishScalar(this.state, 'after');
		else if (mode === 'async-scalar-helper') {
			const result = await publishAsyncScalar(this.state, 'after');
			if (result.value !== 'after') throw new Error('Lost raw return');
		} else if (mode === 'parent') this.state.nested = { value: 'after' };
		else if (mode === 'child-map') await child();
		else if (mode === 'map-reset') {
			this.state.lookup.set('obsolete', 1);
			this.state.lookup = new Map([['fresh', 2]]);
		}
	};
	return () => <button onClick={() => update()}>Update</button>;
}
