import type { Child } from '@exactjs/core';

/** Compiler-backed wrapper for the left logical enhancement target. */
export function left(props: { children?: Child }) {
	return () => <div className="left-shell">{props.children}</div>;
}
