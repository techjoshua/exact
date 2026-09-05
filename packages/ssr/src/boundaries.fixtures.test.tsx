import type { Component } from '@exactjs/core';
import { createServerBoundary } from '@exactjs/core/runtime/render';

/** Compiler-backed host whose client-boundary props read request-local component state. */
export function StateDerivedBoundaryHost(this: Component<{ title: string }>) {
	this.state.title = 'Ready';
	return () =>
		createServerBoundary('island-2', 'Panel_ExactClient_1', {
			title: this.state.title
		});
}
