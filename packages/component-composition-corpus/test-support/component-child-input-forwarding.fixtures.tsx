import type { Child } from '@exactjs/core';
/** Actual receiving output owns H after opaque authored selection has completed. */
export function H(props: { children?: Child }) {
	return () => <i>{props.children}</i>;
}
/** The selected child is consumed here, rather than at its input position under M. */
export function W(props: { children?: Child }) {
	return () => <section>{props.children}</section>;
}
/** The same raw recipe is supplied twice. Ordinary selection returns one raw handle. */
export function M(props: { children?: Child | Child[] }) {
	const pick = (values: Child | Child[] | undefined) =>
		Array.isArray(values) ? values[1] : values;
	return () => <W>{pick(props.children)}</W>;
}
/** No acquisition belongs to the unused duplicate input position. */
export function OccurrenceForwarding(props: { probe: { readonly value: string } }) {
	const h = <H>{props.probe.value}</H>;
	return () => (
		<M>
			{h}
			{h}
		</M>
	);
}
