import type { Component } from '@exactjs/core';

/**
 * Native child rendered directly by React-owned JSX through the compiler brand.
 */
export function ExactCompatibilityBadge(this: Component<{}>) {
	return () => <small>Native eXact child retained across the React boundary</small>;
}
