import type { AccessibleName } from '../contracts.js';

/** Performs the role of domain operation. */
export function roleOf(element: Element): string | undefined {
	const explicit = element.getAttribute('role');
	if (explicit) return explicit.split(/\s+/)[0];
	const tag = element.tagName.toLowerCase();
	if (tag === 'button') return 'button';
	if (tag === 'a' && element.hasAttribute('href')) return 'link';
	if (/^h[1-6]$/.test(tag)) return 'heading';
	if (tag === 'img' && element.getAttribute('alt') !== '') return 'img';
	if (tag === 'ul' || tag === 'ol') return 'list';
	if (tag === 'li') return 'listitem';
	if (tag === 'nav') return 'navigation';
	if (tag === 'main') return 'main';
	if (tag === 'table') return 'table';
	if (tag === 'tr') return 'row';
	if (tag === 'th') return 'columnheader';
	if (tag === 'td') return 'cell';
	if (tag === 'textarea') return 'textbox';
	if (tag === 'select') return (element as HTMLSelectElement).multiple ? 'listbox' : 'combobox';
	if (tag === 'form')
		return element.getAttribute('aria-label') || element.getAttribute('aria-labelledby')
			? 'form'
			: undefined;
	if (tag === 'input') {
		const type = (element.getAttribute('type') ?? 'text').toLowerCase();
		if (['button', 'submit', 'reset'].includes(type)) return 'button';
		if (type === 'checkbox') return 'checkbox';
		if (type === 'radio') return 'radio';
		if (type === 'range') return 'slider';
		if (type === 'number') return 'spinbutton';
		if (!['hidden', 'file', 'color'].includes(type)) return 'textbox';
	}
	return undefined;
}
/** Performs the accessible name domain operation. */
export function accessibleName(element: Element): string {
	const labelledBy = element.getAttribute('aria-labelledby');
	if (labelledBy)
		return labelledBy
			.split(/\s+/)
			.map((id) => element.ownerDocument.getElementById(id)?.textContent ?? '')
			.join(' ')
			.trim();
	return (
		element.getAttribute('aria-label') ??
		labelText(element) ??
		(element.matches('input')
			? (element as HTMLInputElement).value
			: (element.textContent?.trim() ?? ''))
	);
}
/** Performs the label text domain operation. */
export function labelText(element: Element): string | undefined {
	if (!element.matches('input, textarea, select')) return undefined;
	return (
		Array.from((element as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).labels ?? [])
			.map((label) => label.textContent?.trim() ?? '')
			.join(' ')
			.trim() || undefined
	);
}
/** Reports whether name. */
export function matchesName(actual: string | undefined, expected: AccessibleName): boolean {
	if (typeof expected === 'string') return actual?.trim() === expected;
	expected.lastIndex = 0;
	return expected.test(actual ?? '');
}
/** Performs the minimal text matches domain operation. */
export function minimalTextMatches(elements: Element[], text: AccessibleName): Element[] {
	return elements.filter(
		(element) =>
			isElementVisible(element) &&
			matchesName(element.textContent?.trim(), text) &&
			!Array.from(element.children).some((child) => matchesName(child.textContent?.trim(), text))
	);
}
/** Reports whether element visible. */
export function isElementVisible(element: Element): boolean {
	for (let cursor: Element | null = element; cursor; cursor = cursor.parentElement) {
		const style = (cursor as unknown as HTMLElement).style;
		if (
			cursor.hasAttribute('hidden') ||
			cursor.getAttribute('aria-hidden') === 'true' ||
			style?.display === 'none' ||
			style?.visibility === 'hidden'
		)
			return false;
		const computed = cursor.ownerDocument.defaultView?.getComputedStyle(cursor);
		if (
			computed?.display === 'none' ||
			computed?.visibility === 'hidden' ||
			computed?.visibility === 'collapse'
		)
			return false;
	}
	return true;
}
