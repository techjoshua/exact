import { type Child } from '@exact/core';
import type { FieldValue } from './contracts.js';

export function childrenArray(children: Child | Child[] | undefined): Child[] {
	return Array.isArray(children) ? children : children === undefined ? [] : [children];
}
export function mergeIds(...values: unknown[]): string | undefined {
	const ids = values
		.flatMap((value) => (typeof value === 'string' ? value.split(/\s+/) : []))
		.filter(Boolean);
	return ids.length ? [...new Set(ids)].join(' ') : undefined;
}
export function withoutId(value: string | null, removed: string): string | undefined {
	return mergeIds(
		value
			?.split(/\s+/)
			.filter((id) => id !== removed)
			.join(' ')
	);
}
export function setDescribedBy(control: Element, value: string | undefined): void {
	if (value) control.setAttribute('aria-describedby', value);
	else control.removeAttribute('aria-describedby');
}
export function combineAsync(...values: unknown[]): Promise<unknown> | undefined {
	const promises = values.filter(isPromiseLike).map((value) => Promise.resolve(value));
	return promises.length ? Promise.all(promises) : undefined;
}
export function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
	return (
		!!value &&
		(typeof value === 'object' || typeof value === 'function') &&
		typeof (value as PromiseLike<unknown>).then === 'function'
	);
}
export function sanitizeId(value: string): string {
	return (
		value
			.trim()
			.replace(/[^A-Za-z0-9_-]+/g, '-')
			.replace(/^-+|-+$/g, '') || 'field'
	);
}
export function nativeError(
	control?: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
): string | undefined {
	return control && !control.validity.valid
		? control.validationMessage || 'Invalid value'
		: undefined;
}
export function controlValue(
	control?: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
): FieldValue {
	if (!control) return null;
	if (
		control instanceof HTMLInputElement &&
		(control.type === 'checkbox' || control.type === 'radio')
	)
		return control.checked;
	if (control instanceof HTMLInputElement && control.type === 'file') return control.files;
	if (control instanceof HTMLSelectElement && control.multiple)
		return Array.from(control.selectedOptions, (option) => option.value);
	return control.value;
}
