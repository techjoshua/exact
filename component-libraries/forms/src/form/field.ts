import { peek, type Component } from '@exactjs/core';
import { markExactComponent } from '@exactjs/core/framework/component-contracts';

import { FieldContext, FormContext } from './context.js';
import type { FieldContextValue, FieldProps, FieldState, FormContextValue } from './contracts.js';
import {
	controlValue,
	mergeIds,
	nativeError,
	sanitizeId,
	setDescribedBy,
	withoutId
} from './values.js';

/** Performs the browser-owned field domain operation. @exact client */
export function Field(this: Component<FieldState>, props: FieldProps) {
	this.state.error = undefined;
	this.state.touched = false;
	this.state.validating = false;
	this.state.helpIds = [];
	let generation = 0;
	let nextHelpIndex = 0;
	let controller: AbortController | undefined;
	const form = this.hasContext(FormContext)
		? (this.getContext(FormContext) as FormContextValue)
		: undefined;
	const owner = this;
	const id = props.id ?? `exact-field-${sanitizeId(props.name)}`;
	const context: FieldContextValue = {
		name: props.name,
		id,
		get required() {
			return props.required ?? false;
		},
		get error() {
			return form?.error(props.name) ?? owner.state.error;
		},
		get touched() {
			return owner.state.touched || !!form?.error(props.name);
		},
		get validating() {
			return owner.state.validating;
		},
		get helpId() {
			return owner.state.helpIds[0];
		},
		get helpIds() {
			return owner.state.helpIds;
		},
		errorId: `${id}-error`,
		attach(control) {
			context.control = control;
			setDescribedBy(
				control,
				mergeIds(control.getAttribute('aria-describedby'), ...context.helpIds)
			);
		},
		detach(control) {
			if (context.control === control) context.control = undefined;
		},
		registerHelp(helpId) {
			if (!owner.state.helpIds.includes(helpId)) {
				owner.state.helpIds = [...owner.state.helpIds, helpId];
				if (context.control)
					setDescribedBy(
						context.control,
						mergeIds(context.control.getAttribute('aria-describedby'), helpId)
					);
			}
		},
		unregisterHelp(helpId) {
			owner.state.helpIds = owner.state.helpIds.filter((id) => id !== helpId);
			if (context.control)
				setDescribedBy(
					context.control,
					withoutId(context.control.getAttribute('aria-describedby'), helpId)
				);
		},
		nextHelpId() {
			const index = ++nextHelpIndex;
			return index === 1 ? `${id}-help` : `${id}-help-${index}`;
		},
		async validate(reveal = false) {
			if (reveal) thisState('touched', true);
			const current = ++generation;
			controller?.abort('superseded');
			controller = new AbortController();
			thisState('validating', true);
			let error = nativeError(context.control);
			if (!error && props.validate) {
				try {
					const result = await props.validate(controlValue(context.control), {
						name: props.name,
						control: context.control,
						signal: controller.signal
					});
					if (result === false) error = 'Invalid value';
					else if (typeof result === 'string') error = result;
				} catch (cause) {
					if (!controller.signal.aborted)
						error = cause instanceof Error ? cause.message : String(cause);
				}
			}
			if (current !== generation) return !context.error;
			thisState('error', error);
			thisState('validating', false);
			return !error;
		},
		input() {
			return context.touched && context.error ? context.validate(false) : undefined;
		},
		blur() {
			thisState('touched', true);
			return context.validate(true);
		}
	};
	const thisState = <K extends keyof FieldState>(key: K, value: FieldState[K]) => {
		this.state[key] = value;
	};
	const registered = peek(() => form?.register(context) ?? true);
	if (registered) this.setContext(FieldContext, context);
	this.onUnmount(() => {
		generation++;
		controller?.abort('unmounted');
		if (registered) form?.unregister(context);
	});
	return () => (registered ? props.children : null);
}

markExactComponent(Field, '@exactjs/forms:Field');
