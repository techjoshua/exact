export function windowFor(element: Element): Window & typeof globalThis {
	return element.ownerDocument.defaultView as unknown as Window & typeof globalThis;
}
export function createEvent(element: Element, type: string, init: EventInit): Event {
	const view = windowFor(element);
	if (type === 'click') return new view.MouseEvent(type, init as MouseEventInit);
	if (type === 'input') return new view.InputEvent(type, init as InputEventInit);
	if (type === 'submit' && view.SubmitEvent)
		return new view.SubmitEvent(type, init as SubmitEventInit);
	if (type === 'focus' || type === 'blur') return new view.FocusEvent(type, init as FocusEventInit);
	return new view.Event(type, init);
}
export function setNativeValue(element: Element, value: unknown): void {
	if (
		element.matches('input') &&
		['checkbox', 'radio'].includes((element as HTMLInputElement).type)
	)
		(element as HTMLInputElement).checked = Boolean(value);
	else if ('value' in element)
		(element as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value = String(
			value ?? ''
		);
	else throw new Error('input() and change() require a form control');
}
