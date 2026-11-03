import type { Component } from '@exactjs/core';

/** A render-time method call keeps its receiver and argument observable. */
export interface ComponentInputInvarianceProps {
	label: string;
	read(this: ComponentInputInvarianceProps, suffix: string): string;
}

/** The definition stays identical when consumers supply different callable inputs. */
export function ComponentInputInvariance(
	this: Component<{}>,
	props: ComponentInputInvarianceProps
) {
	return () => <output>{props.read(props.label)}</output>;
}
