import type { Child } from '@exactjs/core';

/** Compiler-backed wrapper for the right logical enhancement target. */
export function right(props: { children?: Child }) {
	return () => <div className="right-shell">{props.children}</div>;
}
