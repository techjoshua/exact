import type { Component } from '@exactjs/core';

function ReadyRoot(this: Component<{}>) {
	return () => <p>ready</p>;
}

function TreeLimitRoot(this: Component<{}>) {
	return () => (
		<main>
			{Array.from({ length: 20 }, (_, index) => (
				<span key={String(index)}>{index}</span>
			))}
		</main>
	);
}

/** Compiler-issued root for bootstrap read-count coverage. */
export const bootstrapReadyRoot = <ReadyRoot />;

/** Compiler-issued root large enough to exceed the configured DOM work budget. */
export const treeLimitRoot = <TreeLimitRoot />;
