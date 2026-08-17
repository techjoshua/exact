import { type Child, type InteractionHandler, type RefBinding } from '@exactjs/core';

/** Defines the field value type contract. */
export type FieldValue = string | string[] | boolean | FileList | null;
/** Describes the result produced by field validation. */
export type FieldValidationResult = string | boolean | void;
/** Defines the field validator type contract. */
export type FieldValidator = (
	value: FieldValue,
	context: FieldValidationContext
) => FieldValidationResult | Promise<FieldValidationResult>;
/** Carries the context required by field validation. */
export type FieldValidationContext = {
	name: string;
	control?: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
	signal: AbortSignal;
};

/** Defines the field context value type contract. */
export type FieldContextValue = {
	name: string;
	id: string;
	required: boolean;
	error?: string;
	touched: boolean;
	validating: boolean;
	helpId?: string;
	readonly helpIds: readonly string[];
	errorId: string;
	control?: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
	attach(control: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement): void;
	detach(control: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement): void;
	validate(reveal?: boolean): Promise<boolean>;
	registerHelp(id: string): void;
	unregisterHelp(id: string): void;
	nextHelpId(): string;
	input(): Promise<boolean> | undefined;
	blur(): Promise<boolean>;
};

/** Defines the form context value type contract. */
export type FormContextValue = {
	register(field: FieldContextValue): boolean;
	unregister(field: FieldContextValue): void;
	validate(): Promise<boolean>;
	readonly submitting: boolean;
	error(name: string): string | undefined;
};

/** Tracks the state owned by form. */
export type FormState = { submitting: boolean };
/** Defines the properties accepted by form. */
export type FormProps = Record<string, unknown> & {
	children?: Child | Child[];
	errors?: Readonly<Record<string, string | readonly string[] | undefined>>;
	onSubmit?: InteractionHandler<[event: SubmitEvent]>;
	onValidSubmit?: InteractionHandler<[event: SubmitEvent, data: FormData]>;
	onInvalidSubmit?: InteractionHandler<[event: SubmitEvent]>;
};
/** Defines the properties accepted by the native form submit control. */
export type SubmitProps = Record<string, unknown> & {
	children?: Child | Child[];
	pendingText?: Child;
};

/** Tracks the state owned by field. */
export type FieldState = {
	error?: string;
	touched: boolean;
	validating: boolean;
	helpIds: string[];
};
/** Defines the properties accepted by field. */
export type FieldProps = {
	name: string;
	id?: string;
	required?: boolean;
	validate?: FieldValidator;
	children?: Child | Child[];
};

/** Defines the properties accepted by label. */
export type LabelProps = Record<string, unknown> & { children?: Child | Child[] };
/** Defines the properties accepted by control. */
export type ControlProps = Record<string, unknown> & {
	id?: string;
	name?: string;
	required?: boolean;
	ref?: RefBinding<HTMLElement>;
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
/** Defines the properties accepted by field help. */
export type FieldHelpProps = Record<string, unknown> & { children?: Child | Child[] };
/** Defines the properties accepted by field error. */
export type FieldErrorProps = Record<string, unknown>;
