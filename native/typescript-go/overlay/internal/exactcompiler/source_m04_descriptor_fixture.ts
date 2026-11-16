/** S09 data-descriptor storage stays dormant through freezing and inheritance. */
export function storeDescriptor(callback: () => string): object {
	const prototype = Object.freeze(Object.defineProperties({}, {
		run: { value: callback }
	}));
	return Object.create(prototype);
}

/** Descriptor conversion reads value eagerly without calling the value it returns. */
export function eagerDescriptor(): object {
	return Object.defineProperty({}, 'run', {
		get value() {
			window.name;
			return () => document.title;
		}
	});
}

/** Installed accessors activate on Get, independently of stored data values. */
export function reachedAccessor(): unknown {
	const target: { run?: string } = {};
	Object.defineProperty(target, 'run', { get() { return document.title; } });
	return target.run;
}

/** DefineProperty converts its key before converting the descriptor. */
export function coercionAndThrow(events: string[]): object {
	const key = { [Symbol.toPrimitive]() { events.push('key'); return 'run'; } };
	const descriptor = { get value(): never { events.push('value'); throw new Error('stop'); } };
	// Reflect accepts a PropertyKey statically. The assertion retains ordinary runtime coercion.
	return Object.defineProperty({}, key as unknown as PropertyKey, descriptor);
}

/** Descriptor-map ownKeys/Get traps belong to conversion, with callback bodies dormant. */
export function proxyDescriptors(events: string[]): object {
	const descriptors = new Proxy({ run: { value: () => document.title } }, {
		ownKeys(target) { events.push('keys'); return Reflect.ownKeys(target); },
		getOwnPropertyDescriptor(target, key) {
			events.push('descriptor'); return Reflect.getOwnPropertyDescriptor(target, key);
		},
		get(target, key, receiver) { events.push('get'); return Reflect.get(target, key, receiver); }
	});
	return Object.defineProperties({}, descriptors);
}

/** An own authored override remains a source Call even when its name is standard. */
export function overrideDefineProperty(): string {
	const owner = { defineProperty() { return document.title; } };
	return owner.defineProperty();
}

/** Object.create converts optional descriptors without activating their stored values. */
export function createDescriptors(): object {
	return Object.create(null, {
		run: { get value() { window.name; return () => document.title; } }
	});
}

/** Installing a setter and freezing its host never performs the setter body. */
export function dormantSetter(): object {
	return Object.freeze(Object.defineProperty({}, 'run', {
		set(_value: unknown) { document.title; }
	}));
}

/** Freeze's Proxy algorithm work stays independent of the dormant data callback. */
export function freezeProxy(events: string[]): object {
	return Object.freeze(new Proxy({ run: () => document.title }, {
		preventExtensions(target) { events.push('prevent'); return Reflect.preventExtensions(target); },
		ownKeys(target) { events.push('keys'); return Reflect.ownKeys(target); },
		getOwnPropertyDescriptor(target, key) {
			events.push('descriptor'); return Reflect.getOwnPropertyDescriptor(target, key);
		},
		defineProperty(target, key, descriptor) {
			events.push('define'); return Reflect.defineProperty(target, key, descriptor);
		}
	}));
}
