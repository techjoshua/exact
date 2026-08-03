import { describe, expect, it } from 'vitest';
import {
	exactEnhancementCatalog,
	registerExactEnhancement,
	withExactEnhancementCatalog
} from './enhancement-catalog.js';

describe('application enhancement catalog', () => {
	it('registers one component per compiler-owned identity', () => {
		const identity = '@exactjs/core:test-enhancement';
		const component = () => () => null;

		registerExactEnhancement(identity, component);
		registerExactEnhancement(identity, component);

		expect(exactEnhancementCatalog.get(identity)).toBe(component);
		expect(() => registerExactEnhancement(identity, () => () => null)).toThrow(
			'Conflicting renderer enhancement implementation'
		);
		expect(() => registerExactEnhancement(`${identity}:invalid`, {})).toThrow(
			'did not resolve to a component function'
		);
	});

	it('preserves an explicit renderer catalog and otherwise supplies the bundle catalog', () => {
		const explicit = new Map();
		const options = { enhancementCatalog: explicit, marker: true };

		expect(withExactEnhancementCatalog(options)).toBe(options);
		expect(withExactEnhancementCatalog({ marker: true })).toMatchObject({
			enhancementCatalog: exactEnhancementCatalog,
			marker: true
		});
	});
});
