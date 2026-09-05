import type { Component } from '@exactjs/core';

function PatchRecoveryRoot(this: Component<{}>, props: { source: { label: string } }) {
	return () => (
		<section>
			<span>{props.source.label}</span>
		</section>
	);
}

/** Creates a compiler-issued root whose retained prop reader can fail during a patch. */
export const patchRecoveryRoot = (source: { label: string }) => (
	<PatchRecoveryRoot source={source} />
);
