import type { Component, Child } from '@exactjs/core';
import type { ContextEntry } from '../contracts.js';

/** Performs the test mount host domain operation. */
export function TestMountHost(
	this: Component<{}>,
	props: { entries: ContextEntry[]; children?: Child | Child[] }
) {
	for (const entry of props.entries) this.setContext(entry.token, entry.value);
	return () => props.children;
}
