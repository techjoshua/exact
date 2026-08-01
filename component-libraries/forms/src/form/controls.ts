import {
	createVNode,
	markExactComponent,
	type Child,
	type Component,
	type RefBinding
} from '@exactjs/core';

import { ControlRef, FieldContext, FormContext } from './context.js';
import type { LabelProps, SubmitProps } from './contracts.js';
import { childrenArray, combineAsync, mergeIds } from './values.js';

/** Performs the label domain operation. */
export function Label(this: Component<{}>, props: LabelProps) {
	const field = this.getContext(FieldContext);
	const { children, ...rest } = props;
	return () => createVNode('label', { ...rest, htmlFor: field.id }, ...childrenArray(children));
}

/** Defines the properties accepted by control. */
export type ControlProps = Record<string, unknown> & {
	id?: string;
	name?: string;
	required?: boolean;
	ref?: RefBinding<any>;
	onInput?: (event: InputEvent) => unknown;
	onBlur?: (event: FocusEvent) => unknown;
	children?: Child | Child[];
};

/** Defines the properties accepted by input. */
export type InputProps = ControlProps;
/** Defines the properties accepted by textarea. */
export type TextareaProps = ControlProps;
/** Defines the properties accepted by select. */
export type SelectProps = ControlProps;
/** Defines the properties accepted by checkbox. */
export type CheckboxProps = ControlProps;
/** Performs the input domain operation. */
export function Input(this: Component<{}>, props: InputProps) {
	return controlComponent.call(this, 'input', props);
}
/** Performs the textarea domain operation. */
export function Textarea(this: Component<{}>, props: TextareaProps) {
	return controlComponent.call(this, 'textarea', props);
}
/** Performs the select domain operation. */
export function Select(this: Component<{}>, props: SelectProps) {
	return controlComponent.call(this, 'select', props);
}
/** Performs the checkbox domain operation. */
export function Checkbox(this: Component<{}>, props: CheckboxProps) {
	return controlComponent.call(this, 'input', { ...props, type: 'checkbox' });
}
/** Renders the form-owned native submit control and its accessible pending presentation. */
export function Submit(this: Component<{}>, props: SubmitProps) {
	const form = this.getContext(FormContext);
	const { children, pendingText, ...rest } = props;
	return () =>
		createVNode(
			'button',
			{
				...rest,
				type: props.type ?? 'submit',
				disabled: form.submitting || props.disabled || undefined,
				'aria-disabled': form.submitting || props['aria-disabled'] || undefined
			},
			...childrenArray(form.submitting && pendingText !== undefined ? pendingText : children)
		);
}

for (const [component, identity] of [
	[Label, '@exactjs/forms:Label'],
	[Input, '@exactjs/forms:Input'],
	[Textarea, '@exactjs/forms:Textarea'],
	[Select, '@exactjs/forms:Select'],
	[Checkbox, '@exactjs/forms:Checkbox'],
	[Submit, '@exactjs/forms:Submit']
] as const)
	markExactComponent(component, identity);

function controlComponent(
	this: Component<{}>,
	tag: 'input' | 'textarea' | 'select',
	props: ControlProps
) {
	const field = this.getContext(FieldContext);
	const binding = this.ref(ControlRef);
	const combined = {
		fulfill(value: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | undefined) {
			binding.fulfill(value);
			props.ref?.fulfill(value);
		}
	};
	this.onMount(() => {
		const control = this.refs.get(ControlRef);
		if (control) field.attach(control);
	});
	this.onUnmount(() => {
		const control = this.refs.get(ControlRef);
		if (control) field.detach(control);
	});
	const input = (event: InputEvent) => combineAsync(props.onInput?.(event), field.input());
	const blur = (event: FocusEvent) => combineAsync(props.onBlur?.(event), field.blur());
	const { children, ref: _ref, onInput: _input, onBlur: _blur, ...rest } = props;
	return () =>
		createVNode(
			tag,
			{
				...rest,
				id: props.id ?? field.id,
				name: props.name ?? field.name,
				required: props.required ?? field.required,
				'aria-describedby': mergeIds(
					props['aria-describedby'],
					...field.helpIds,
					field.touched && field.error ? field.errorId : undefined
				),
				'aria-invalid': field.touched && !!field.error ? true : props['aria-invalid'],
				ref: combined,
				onInput: input,
				onBlur: blur
			},
			...childrenArray(children)
		);
}
