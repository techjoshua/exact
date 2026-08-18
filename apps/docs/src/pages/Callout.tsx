import type { Child, Component } from '@exactjs/core';

type CalloutProps = {
	tone?: 'note' | 'warning' | 'tip';
	title: string;
	children?: Child | Child[];
};

/** Renders a semantically titled aside for important article guidance. */
export function Callout(this: Component<{}>, props: CalloutProps) {
	return () => (
		<aside theme:surface="sunken" className={['callout', `callout--${props.tone ?? 'note'}`]}>
			<strong theme:text="heading">{props.title}</strong>
			<div>{props.children}</div>
		</aside>
	);
}
