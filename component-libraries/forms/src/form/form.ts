import { createVNode, ErrorContext, markExactComponent, type Component } from '@exactjs/core';

import { FormContext } from './context.js';
import type { FieldContextValue, FormContextValue, FormProps, FormState } from './contracts.js';
import { childrenArray } from './values.js';

/** Performs the form domain operation. */
export function Form(this: Component<FormState>, props: FormProps) {
	this.state.submitting = false;
	const fields = new Set<FieldContextValue>();
	const errors = this.getContext(ErrorContext);
	const context: FormContextValue = {
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
	this.setContext(FormContext, context);
	const submit = async (event: SubmitEvent) => {
		const userResult = props.onSubmit?.(event);
		const cancelled = event.defaultPrevented;
		event.preventDefault();
		await userResult;
		if (cancelled) return;
		if (this.state.submitting) return;
		this.state.submitting = true;
		try {
			const valid = await context.validate();
			if (!valid) {
				[...fields].find((field) => !!field.error)?.control?.focus();
				await props.onInvalidSubmit?.(event);
				return;
			}
			const form = event.target as HTMLFormElement;
			await props.onValidSubmit?.(event, new form.ownerDocument.defaultView!.FormData(form));
		} finally {
			this.state.submitting = false;
		}
	};
	return () => {
		const {
			children,
			onSubmit: _submit,
			onValidSubmit: _valid,
			onInvalidSubmit: _invalid,
			...rest
		} = props;
		return createVNode(
			'form',
			{
				...rest,
				noValidate: props.noValidate ?? true,
				onSubmit: submit,
				'aria-busy': this.state.submitting || undefined
			},
			...childrenArray(children)
		);
	};
}

markExactComponent(Form);
