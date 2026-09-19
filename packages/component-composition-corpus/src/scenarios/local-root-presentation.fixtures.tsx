import type { Component, RootLifecycle } from '@exactjs/core';

/** Captures local lifecycle observations without exposing mounted renderer nodes. */
export const localRoots: RootLifecycle<object>[] = [];

function LocalTarget(this: Component<{}>) {
	localRoots.push(this.refs.root());
	return () => (
		<article>
			<_target />
		</article>
	);
}

function LocalParent(this: Component<{}>) {
	localRoots.push(this.refs.root());
	return () => (
		<main>
			<LocalTarget>
				<button>child</button>
			</LocalTarget>
		</main>
	);
}

/** Local root preference does not export through an unrelated parent's output. */
export const localParentRoot = <LocalParent />;

/** A text component exposes its durable state for identity-preserving updates. */
export let localTextOwner: Component<{ value: string }>;

function LocalText(this: Component<{ value: string }>) {
	localTextOwner = this;
	localRoots.push(this.refs.root());
	this.state.value = 'before';
	return () => this.state.value;
}

/** Text output is observable without pretending it is an Element. */
export const localTextRoot = <LocalText />;

function LocalRange(this: Component<{}>) {
	localRoots.push(this.refs.root());
	return () => (
		<_>
			{'first'}
			{'second'}
		</_>
	);
}

/** Several text nodes have one retained logical presentation. */
export const localRangeRoot = <LocalRange />;
