import type { Component } from '@exactjs/core';
import { renderToHydratableString } from './index.js';

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

/** Exercises compiler-closed SSR with root-prop publication enabled. */
export async function renderPublishedRoot(label: string) {
	return await renderToHydratableString(<PublishedRoot label={label} />, {
		publishRootProps: true
	});
}

/** Exercises nested component-local positional root-prop publication. */
export async function renderPositionalPublishedRoot() {
	return await renderToHydratableString(
		<PositionalPublishedRoot rows={[{ id: 'first', detail: { ready: true } }]} label="queue" />,
		{ publishRootProps: true }
	);
}

/** Exercises the named fallback when runtime data exceeds the finite authored shape. */
export async function renderMismatchedPositionalPublishedRoot() {
	const detail = { ready: true, source: 'runtime' } as { ready: boolean };
	return await renderToHydratableString(
		<PositionalPublishedRoot rows={[{ id: 'first', detail }]} label="queue" />,
		{ publishRootProps: true }
	);
}

/** Exercises one normal read of a compiler-declared positional field. */
export async function renderAccessorPositionalPublishedRoot(onRead: () => void) {
	const detail = {} as { ready: boolean };
	Object.defineProperty(detail, 'ready', {
		enumerable: true,
		get() {
			onRead();
			return true;
		}
	});
	return await renderToHydratableString(
		<PositionalPublishedRoot rows={[{ id: 'first', detail }]} label="queue" />,
		{ publishRootProps: true }
	);
}

/** Exercises the named fallback when a runtime object substitutes another own field. */
export async function renderMissingPositionalPublishedRoot() {
	const detail = { source: true } as unknown as { ready: boolean };
	return await renderToHydratableString(
		<PositionalPublishedRoot rows={[{ id: 'first', detail }]} label="queue" />,
		{ publishRootProps: true }
	);
}
