import type { Component } from '@exactjs/core';
import { renderToHydratableString, renderToHydratableStringAsync } from './index.js';

/** Compiler-backed conditional child used to verify emitted hydration range identity. */
export function HydrationPanel(this: Component<{ show: boolean }>) {
	this.state.show = true;
	return () => (
		<section>{this.state.show ? <strong>Visible</strong> : <span>Hidden</span>}</section>
	);
}

function PublishedRoot(this: Component<{}>, props: { label: string }) {
	return () => <main>{props.label}</main>;
}

/** Exercises compiler-closed synchronous SSR with root-prop publication enabled. */
export function renderPublishedRoot(label: string) {
	return renderToHydratableString(<PublishedRoot label={label} />, { publishRootProps: true });
}

/** Exercises compiler-closed asynchronous SSR with root-prop publication enabled. */
export function renderPublishedRootAsync(label: string) {
	return renderToHydratableStringAsync(<PublishedRoot label={label} />, { publishRootProps: true });
}
