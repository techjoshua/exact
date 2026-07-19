import { type Child, type RefBinding } from '@exact/core';

export type FieldValue = string | string[] | boolean | FileList | null;
export type FieldValidationResult = string | boolean | void;
export type FieldValidator = (
	value: FieldValue,
	context: FieldValidationContext
) => FieldValidationResult | Promise<FieldValidationResult>;
export type FieldValidationContext = {
	name: string;
	control?: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
	signal: AbortSignal;
};

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

export type FormContextValue = {
	register(field: FieldContextValue): boolean;
	unregister(field: FieldContextValue): void;
	validate(): Promise<boolean>;
};

export type FormState = { submitting: boolean };
export type FormProps = Record<string, unknown> & {
	children?: Child | Child[];
	onSubmit?(event: SubmitEvent): unknown;
	onValidSubmit?(event: SubmitEvent, data: FormData): unknown;
	onInvalidSubmit?(event: SubmitEvent): unknown;
};

export type FieldState = {
	error?: string;
	touched: boolean;
	validating: boolean;
	helpIds: string[];
};
export type FieldProps = {
	name: string;
	id?: string;
	required?: boolean;
	validate?: FieldValidator;
	children?: Child | Child[];
};

export type LabelProps = Record<string, unknown> & { children?: Child | Child[] };
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
export type FieldHelpProps = Record<string, unknown> & { children?: Child | Child[] };
export type FieldErrorProps = Record<string, unknown>;
