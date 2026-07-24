import { TextDecoder, TextEncoder } from 'node:util';

if (!globalThis.TextEncoder) {
	Object.defineProperty(globalThis, 'TextEncoder', {
		configurable: true,
		value: TextEncoder
	});
}
if (!globalThis.TextDecoder) {
	Object.defineProperty(globalThis, 'TextDecoder', {
		configurable: true,
		value: TextDecoder
	});
}
