import { peek, type Component } from '@exactjs/core';

import { FieldContext } from './context.js';
import type { FieldHelpProps } from './contracts.js';

/** Performs the field help domain operation. */
export function FieldHelp(this: Component<{}>, props: FieldHelpProps) {
	const field = this.getContext(FieldContext);
	const helpId = peek(() => (typeof props.id === 'string' ? props.id : field.nextHelpId()));
	this.onMount(() => field.registerHelp(helpId));
	this.onUnmount(() => field.unregisterHelp(helpId));
	const { children, ...rest } = props;
	return () => (
		<span {...rest} id={helpId}>
			{children}
		</span>
	);
}

/** Defines the properties accepted by field error. */
export type FieldErrorProps = Record<string, unknown>;
/** Performs the field error domain operation. */
export function FieldError(this: Component<{}>, props: FieldErrorProps) {
	const field = this.getContext(FieldContext);
	return () =>
		field.touched && field.error ? (
			<span {...props} id={field.errorId} role="alert">
				{field.error}
			</span>
		) : null;
}
