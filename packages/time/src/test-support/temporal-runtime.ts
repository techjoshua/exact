import { Temporal } from '@js-temporal/polyfill';

// Keep native Temporal as the independent oracle where available. Older test
// hosts need the same standard API for emitted artifacts and expected values.
if (!Reflect.get(globalThis, 'Temporal'))
	Object.defineProperty(globalThis, 'Temporal', {
		value: Temporal,
		configurable: true,
		writable: true
	});
