import type { Component } from '@exactjs/core';
import { ReactRootContext, type ReactRootRuntime } from './shared.js';

/** Reads a react root runtime from its source representation. */
export function readReactRootRuntime(
	component: Component<Record<string, unknown>>
): ReactRootRuntime | undefined {
	try {
		return component.getContext(ReactRootContext);
	} catch {
		return undefined;
	}
}
