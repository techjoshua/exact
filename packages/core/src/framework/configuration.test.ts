import { expect, it } from 'vitest';
import { deriveRuntimeConfiguration } from './configuration.js';

it('retains lazy original-owner access and local writable overrides', () => {
	let reads = 0;
	class Configuration {
		#maximum = 1;
		get maximum() {
			reads++;
			return this.#maximum;
		}
		advance() {
			this.#maximum++;
		}
	}
	const configuration = Object.freeze(new Configuration());
	const derived = deriveRuntimeConfiguration(configuration, () => ({}));
	expect(reads).toBe(0);
	expect(derived.maximum).toBe(1);
	derived.advance();
	expect(configuration.maximum).toBe(2);
	expect(derived.maximum).toBe(2);
	Object.defineProperty(derived, 'maximum', { value: 10, writable: true });
	expect(derived.maximum).toBe(10);
	expect(configuration.maximum).toBe(2);
});
it('keeps enumerable callback receivers scoped and virtual fields readable', () => {
	const source = {
		value: 1,
		read() {
			return this.value;
		}
	};
	const derived = deriveRuntimeConfiguration(source, () => ({ value: 2 }));
	expect(derived.read()).toBe(2);
	expect(source.read()).toBe(1);
	const virtual = new Proxy(
		{ value: 3 },
		{
			get(target, key, receiver) {
				return key === 'value' ? 4 : Reflect.get(target, key, receiver);
			},
			ownKeys() {
				return [];
			}
		}
	);
	expect(deriveRuntimeConfiguration(virtual, () => ({})).value).toBe(4);
});
it('rejects cyclic configuration prototypes without applying overrides', () => {
	let applied = false;
	const cyclic: object = new Proxy(
		{},
		{
			getPrototypeOf() {
				return cyclic;
			}
		}
	);
	expect(() =>
		deriveRuntimeConfiguration(cyclic, () => {
			applied = true;
			return {};
		})
	).toThrow('Cyclic runtime configuration prototype');
	expect(applied).toBe(false);
});
