import { createVNode, type Child, type Component, type RefBinding } from '@exact/core';

import { ControlRef, FieldContext } from './context.js';
import type { LabelProps } from './contracts.js';
import { childrenArray, combineAsync, mergeIds } from './values.js';

export function Label(this: Component<{}>, props: LabelProps) {
	const field = this.getContext(FieldContext);
	return () => {
		const { children, ...rest } = props;
		return createVNode('label', { ...rest, htmlFor: field.id }, ...childrenArray(children));
	};
}

export type ControlProps = Record<string, unknown> & {
	id?: string;
	name?: string;
	required?: boolean;
	ref?: RefBinding<any>;
	onInput?: (event: InputEvent) => unknown;
	onBlur?: (event: FocusEvent) => unknown;
	children?: Child | Child[];
};

export type InputProps = ControlProps;
export type TextareaProps = ControlProps;
export type SelectProps = ControlProps;
export type CheckboxProps = ControlProps;
export function Input(this: Component<{}>, props: InputProps) {
	return controlComponent.call(this, 'input', props);
}
export function Textarea(this: Component<{}>, props: TextareaProps) {
	return controlComponent.call(this, 'textarea', props);
}
export function Select(this: Component<{}>, props: SelectProps) {
	return controlComponent.call(this, 'select', props);
}
export function Checkbox(this: Component<{}>, props: CheckboxProps) {
	return controlComponent.call(this, 'input', { ...props, type: 'checkbox' });
}

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
	return () => {
		const { children, ref: _ref, onInput: _input, onBlur: _blur, ...rest } = props;
		const describedBy = mergeIds(
			props['aria-describedby'],
			...field.helpIds,
			field.touched && field.error ? field.errorId : undefined
		);
		const invalid = field.touched && !!field.error ? true : props['aria-invalid'];
		return createVNode(
			tag,
			{
				...rest,
				id: props.id ?? field.id,
				name: props.name ?? field.name,
				required: props.required ?? field.required,
				'aria-describedby': describedBy,
				'aria-invalid': invalid,
				ref: combined,
				onInput: input,
				onBlur: blur
			},
			...childrenArray(children)
		);
	};
}
