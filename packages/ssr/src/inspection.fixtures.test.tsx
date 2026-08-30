import type { Component } from '@exactjs/core';

/** Compiler-backed server component exposing state through its direct request snapshot. */
export function InspectablePage(this: Component<{ title?: string }>) {
	this.state.title = 'Server';
	return () => <h1>{this.state.title}</h1>;
}

/** Compiler-backed static page used by request-runtime retention coverage. */
export function StaticServerPage() {
	return () => <h1>Server</h1>;
}
