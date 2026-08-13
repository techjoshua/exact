/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest';
import type { RefBinding, RefKey } from './contracts.js';
import {
	adoptElementId,
	attachElementIdentity,
	ensureElementId,
	reserveElementId,
	reservedElementId,
	resolveElementId
} from './element-identity.js';

describe('element identity', () => {
	it('assigns permanent identity directly to materialized elements', () => {
		const element = { id: '' };
		const id = ensureElementId(element);
		expect(id).toMatch(/^exact-/u);
		expect(ensureElementId(element)).toBe(id);
	});

	it('reserves one native UUID and assigns it when the element attaches', () => {
		const binding = refBinding<Element>();
		const id = reserveElementId(binding);
		expect(id).toMatch(/^exact-[0-9a-f-]{36}$/u);
		expect(reserveElementId(binding)).toBe(id);

		const element = document.createElement('span');
		attachElementIdentity(binding, element);
		binding.fulfill(element);
		expect(element.id).toBe(id);
		expect(resolveElementId(binding)).toBe(id);
	});

	it('preserves valid authored and adopted IDs without replacing invalid authored identity', () => {
		const authored = refBinding<Element>();
		const element = document.createElement('span');
		element.id = 'authored-label';
		attachElementIdentity(authored, element);
		authored.fulfill(element);
		expect(resolveElementId(authored)).toBe('authored-label');

		const adopted = refBinding<Element>();
		expect(adoptElementId(adopted, 'server-label')).toBe(true);
		expect(reservedElementId(adopted)).toBe('server-label');

		const invalid = refBinding<Element>();
		const invalidElement = document.createElement('span');
		invalidElement.id = 'not a token';
		invalid.fulfill(invalidElement);
		expect(resolveElementId(invalid)).toBeUndefined();
		expect(invalidElement.id).toBe('not a token');
	});
});

function refBinding<T>(): RefBinding<T> {
	let current: T | undefined;
	return {
		get current() {
			return current;
		},
		key: { id: Symbol('test-ref'), description: 'test ref' } as RefKey<T>,
		owner: {} as RefBinding<T>['owner'],
		fulfill(value) {
			current = value;
		}
	};
}
