import type { Child, Component } from '@exactjs/core';

type CalloutProps = {
	tone?: 'note' | 'warning' | 'tip';
	title: string;
	children?: Child | Child[];
};

/** Renders a semantically titled aside for important article guidance. */
export function Callout(this: Component<{}>, props: CalloutProps) {
	return () => (
		<aside className={['callout', `callout--${props.tone ?? 'note'}`]}>
			<strong>{props.title}</strong>
			<div>{props.children}</div>
		</aside>
	);
}
