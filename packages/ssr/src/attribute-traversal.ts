/** Reports whether an enumerable property belongs directly to its props object. */
export function hasOwn(value: object, name: string): boolean {
	return Object.prototype.hasOwnProperty.call(value, name);
}

/** Reports whether a JSX property uses the conventional event-handler spelling. */
export function isEventProperty(name: string): boolean {
	if (name.length < 3 || name.charCodeAt(0) !== 111 || name.charCodeAt(1) !== 110) return false;
	const first = name.charCodeAt(2);
	return first >= 65 && first <= 90;
}

/** Reports whether React 19 serializes an input property before ordinary properties. */
export function isReactInputPriority(name: string): boolean {
	return name === 'type' || name === 'disabled' || name === 'name';
}

/** Reports whether React serializes an input property after ordinary properties. */
export function isReactInputDeferred(name: string): boolean {
	return (
		name === 'checked' || name === 'defaultChecked' || name === 'value' || name === 'defaultValue'
	);
}

/** Fixed React 19 input property prefix. */
export const reactInputPriority = ['type', 'disabled', 'name'] as const;

/** Fixed React input property suffix. */
export const reactInputDeferred = ['checked', 'defaultChecked', 'value', 'defaultValue'] as const;

/** Fixed React option property suffix. */
export const reactOptionDeferred = ['value', 'selected'] as const;
