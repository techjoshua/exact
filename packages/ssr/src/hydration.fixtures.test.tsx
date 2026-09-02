import type { Component } from '@exactjs/core';
import { renderToHydratableString, renderToHydratableStringAsync } from './index.js';

/** Compiler-backed conditional child used to verify emitted hydration range identity. */
export function HydrationPanel(this: Component<{ show: boolean }>) {
	// Retain capture so hydration publication tests exercise a non-reconstructible state value.
	this.state.show = Boolean(1);
	return () => (
		<section>{this.state.show ? <strong>Visible</strong> : <span>Hidden</span>}</section>
	);
}

function PublishedRoot(this: Component<{}>, props: { label: string }) {
	return () => <main>{props.label}</main>;
}

export function PositionalPublishedRoot(
	this: Component<{}>,
	props: { rows: Array<{ id: string; detail: { ready: boolean } }>; label: string }
) {
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

/** Exercises nested component-local positional root-prop publication. */
export function renderPositionalPublishedRoot() {
	return renderToHydratableString(
		<PositionalPublishedRoot rows={[{ id: 'first', detail: { ready: true } }]} label="queue" />,
		{ publishRootProps: true }
	);
}

/** Exercises the named fallback when runtime data exceeds the finite authored shape. */
export function renderMismatchedPositionalPublishedRoot() {
	const detail = { ready: true, source: 'runtime' } as { ready: boolean };
	return renderToHydratableString(
		<PositionalPublishedRoot rows={[{ id: 'first', detail }]} label="queue" />,
		{ publishRootProps: true }
	);
}

/** Exercises descriptor-safe rejection without invoking an authored accessor. */
export function renderAccessorPositionalPublishedRoot(onRead: () => void) {
	const detail = {} as { ready: boolean };
	Object.defineProperty(detail, 'ready', {
		enumerable: true,
		get() {
			onRead();
			return true;
		}
	});
	return renderToHydratableString(
		<PositionalPublishedRoot rows={[{ id: 'first', detail }]} label="queue" />,
		{ publishRootProps: true }
	);
}
