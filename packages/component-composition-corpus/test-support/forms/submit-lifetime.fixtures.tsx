import {
	createRef,
	createErrorContext,
	ErrorContext,
	type ErrorContextValue,
	type Component
} from '@exactjs/core';
import { render, type RenderOptions } from '@exactjs/dom/root';
import { Form } from '../../../../component-libraries/forms/src/form/form.js';
import { Field } from '../../../../component-libraries/forms/src/form/field.js';
import type { FieldValidator } from '../../../../component-libraries/forms/src/form/contracts.js';

/** Callbacks held by the shared form lifetime journey without an Input placement dependency. */
export type SubmitLifetimeProps = {
	validate?: FieldValidator;
	errors?: Readonly<Record<string, string | undefined>>;
	raw?: (event: SubmitEvent) => void | Promise<void>;
	valid?: () => void | Promise<void>;
	invalid?: () => void | Promise<void>;
};
/** Native ref used to check actual retained ownership and release. */
export const submitButton = createRef<HTMLButtonElement>('form submit lifetime');
/** Current durable fixture owner, kept observable for lifecycle assertions. */
export let submitOwner: Component<{}> | undefined;

/** Error boundary owned by the current fixture, separate from unexpected root reports. */
export let submitErrors: ErrorContextValue | undefined;

/** Exercises package-owned submit stages without the separately unresolved Input helper. */
export function SubmitLifetime(this: Component<{}>, props: SubmitLifetimeProps) {
	submitOwner = this;
	const errors = createErrorContext();
	submitErrors = errors;
	this.setContext(ErrorContext, errors);
	return () => (
		<Form
			errors={props.errors}
			onSubmit={props.raw}
			onValidSubmit={props.valid}
			onInvalidSubmit={props.invalid}
		>
			<Field name="entry" validate={props.validate} />
			<button type="submit" ref={this.ref(submitButton)}>
				Save
			</button>
		</Form>
	);
}

/** Mounts the same authored source for source tests and native browser adapter journeys. */
export function mountSubmitLifetime(
	host: Element,
	props: SubmitLifetimeProps,
	options: RenderOptions
) {
	render(<SubmitLifetime {...props} />, host, options);
}
