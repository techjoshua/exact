import { ErrorContext, type Component } from '@exactjs/core';

import { FormContext } from './context.js';
import type { FieldContextValue, FormContextValue, FormProps, FormState } from './contracts.js';

/** Coordinates native submission while its durable Form owner remains mounted. */
export function Form(this: Component<FormState>, props: FormProps) {
	this.state.submitting = false;
	const fields = new Set<FieldContextValue>();
	// Final disposal retires later submit stages without cancelling an already-started callback.
	let disposed = false;
	this.onUnmount(() => {
		disposed = true;
	});
	const errors = this.getContext(ErrorContext);
	const context: FormContextValue = {
		get submitting() {
			return owner.state.submitting;
		},
		error(name) {
			const value = props.errors?.[name];
			return typeof value === 'string' ? value : value?.join(' ');
		},
		register(field) {
			const duplicate = [...fields].find((existing) => existing.id === field.id);
			if (duplicate) {
				errors.report(
					new Error(
						`Field id "${field.id}" is already registered; repeated field names require explicit distinct ids`
					),
					{
						source: 'construct',
						phase: 'field-registration'
					}
				);
				return false;
			}
			fields.add(field);
			return true;
		},
		unregister: (field) => fields.delete(field),
		async validate() {
			const results = await Promise.all([...fields].map((field) => field.validate(true)));
			return results.every(Boolean);
		}
	};
	const owner = this;
	this.setContext(FormContext, context);
	const submit = async (event: SubmitEvent) => {
		if (this.state.submitting) {
			event.preventDefault();
			return;
		}
		const userResult = props.onSubmit?.(event);
		const cancelled = event.defaultPrevented;
		event.preventDefault();
		await userResult;
		if (disposed || cancelled) return;
		if (this.state.submitting) return;
		this.state.submitting = true;
		try {
			const valid = await context.validate();
			if (disposed) return;
			if (!valid) {
				[...fields].find((field) => !!field.error)?.control?.focus();
				await props.onInvalidSubmit?.(event);
				return;
			}
			const form = event.target as HTMLFormElement;
			await props.onValidSubmit?.(event, new form.ownerDocument.defaultView!.FormData(form));
		} finally {
			if (!disposed) this.state.submitting = false;
		}
	};
	const {
		children,
		errors: _errors,
		onSubmit: _submit,
		onValidSubmit: _valid,
		onInvalidSubmit: _invalid,
		...rest
	} = props;
	return () => (
		<form
			{...rest}
			noValidate={props.noValidate ?? true}
			onSubmit={submit}
			aria-busy={this.state.submitting || undefined}
		>
			{children}
		</form>
	);
}
