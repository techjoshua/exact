import type { Child, Component } from '@exactjs/core';

/** Compiler-produced enhancement implementation for the routed stream fixture. */
export function StreamEnhancement(
	this: Component<{}>,
	props: { routed?: true; children?: Child | Child[] }
) {
	return () => <aside>{props.children}</aside>;
}
