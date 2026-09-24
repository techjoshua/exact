/* eslint-disable @typescript-eslint/no-unused-vars -- The compiler resolves enhancement namespaces. */
import type { Component } from '@exactjs/core';
import { tone } from '@acceptance/tone' with { type: 'exact-enhancement' };

/** A packaged control whose callback changes while its intrinsic host is retained. */
export function Control(props: { label: string; select?: () => void }) {
	return () => (
		<button data-control tone:value="active" onClick={props.select}>
			{props.label}
		</button>
	);
}

/** Exposes row cleanup as an application-owned observation. */
export function Row(
	this: Component<{}>,
	props: { id: string; label: string; removed: (id: string) => void }
) {
	this.onMount(() => {
		this.onUnmount(() => props.removed(props.id));
	});
	return () => <li data-row={props.id}>{props.label}</li>;
}
