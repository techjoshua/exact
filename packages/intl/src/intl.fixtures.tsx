import type { Child } from '@exactjs/core';

function StrongStructure(props: { children: readonly Child[] }) {
	return () => <strong>{props.children}</strong>;
}

/** Compiler-owned structural binding used by the protocol tests. */
export const strongStructure = (children: readonly Child[]): Child => (
	<StrongStructure>{children}</StrongStructure>
);
