import { unwrap } from '@exact/reactive';

export function normalizeReactHostProps(tag: string, props: Record<string, unknown>): void {
	const handlers = Object.entries(props).filter(
		([name, value]) => /^on[A-Z]/.test(name) && typeof value === 'function'
	);
	for (const [name, value] of handlers) {
		delete props[name];
		let normalized = name;
		if (name === 'onFocus' || name === 'onFocusCapture')
			normalized = name.replace('onFocus', 'onFocusIn');
		else if (name === 'onBlur' || name === 'onBlurCapture')
			normalized = name.replace('onBlur', 'onFocusOut');
		else if (
			(tag === 'input' || tag === 'textarea') &&
			(name === 'onChange' || name === 'onChangeCapture')
		) {
			const type = String(props.type ?? '').toLowerCase();
			if (type !== 'checkbox' && type !== 'radio' && type !== 'file')
				normalized = name.replace('onChange', 'onInput');
		}
		const wrapped = reactEventHandler(value as (event: Event) => unknown, props);
		const existing = props[normalized];
		props[normalized] =
			typeof existing === 'function'
				? function reactComposedHandler(this: Element, event: Event) {
						(existing as (this: Element, event: Event) => unknown).call(this, event);
						return wrapped.call(this, event);
					}
				: wrapped;
	}
}

export function reactEventHandler(
	handler: (event: Event) => unknown,
	props: Record<string, unknown>
) {
	return function exactReactEvent(this: Element, event: Event): unknown {
		augmentReactEvent(event);
		try {
			return handler.call(this, event);
		} finally {
			if (
				this instanceof HTMLInputElement ||
				this instanceof HTMLTextAreaElement ||
				this instanceof HTMLSelectElement
			) {
				if (props.value !== undefined && 'value' in this)
					this.value = String(unwrap(props.value) ?? '');
				if (this instanceof HTMLInputElement && props.checked !== undefined)
					this.checked = Boolean(unwrap(props.checked));
			}
		}
	};
}

export function augmentReactEvent(event: Event): void {
	const record = event as Event & {
		nativeEvent?: Event;
		persist?: () => void;
		isDefaultPrevented?: () => boolean;
		isPropagationStopped?: () => boolean;
	};
	record.nativeEvent ??= event;
	record.persist ??= () => {};
	record.isDefaultPrevented ??= () => event.defaultPrevented;
	record.isPropagationStopped ??= () => event.cancelBubble;
}
