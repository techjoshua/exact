import type { Component } from '@exactjs/core';

/** Compiler-owned compact island used by the hydration table tests. */
export function CompactCounter(this: Component<{}>, props: { label: string }) {
	return () => <button>{props.label}</button>;
}

/** Compiler-owned interaction island with a stable replay target. */
export function CompactDialog(this: Component<{}>, props: { label: string }) {
	return () => <button data-exact-id="dialog-button">{props.label}</button>;
}

/** Compiler-owned compact island used to isolate malformed sibling rows. */
export function CompactLabel(this: Component<{}>, props: { label: string }) {
	return () => <span>{props.label}</span>;
}
