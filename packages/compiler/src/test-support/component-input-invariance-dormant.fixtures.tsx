import type { Component } from '@exactjs/core';
import type { ComponentInputInvarianceProps } from './component-input-invariance.fixtures.js';

/** Supplying a callback does not execute it when the component only stores it. */
export function DormantComponentInputInvariance(
	this: Component<{}>,
	props: ComponentInputInvarianceProps
) {
	return () => <output>{props.label}</output>;
}
