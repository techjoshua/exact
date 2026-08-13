import { describe, expect, it } from 'vitest';
import { parseExactLanguageDeclaration } from './validation.js';
import { parseExactDeclarativeLanguageContribution } from './declarative.js';

describe('language package declarations', () => {
	it('accepts a bounded analyzer declaration', () => {
		expect(
			parseExactLanguageDeclaration({
				schemaVersion: 1,
				analyzer: {
					protocolVersion: '^1.0.0',
					subpath: './language',
					capabilities: ['diagnostics', 'hover'],
					projection: ['sourceText', 'enhancements']
				}
			})
		).toMatchObject({ schemaVersion: 1 });
	});

	it.each([
		{},
		{ schemaVersion: 1, unknown: true, declarative: './rules' },
		{ schemaVersion: 1, declarative: '../private.json' },
		{
			schemaVersion: 1,
			analyzer: {
				protocolVersion: '^1',
				subpath: './language',
				capabilities: ['diagnostics', 'diagnostics'],
				projection: []
			}
		}
	])('rejects malformed or ambiguous declarations', (value) => {
		expect(() => parseExactLanguageDeclaration(value)).toThrow();
	});
});

describe('parseExactDeclarativeLanguageContribution', () => {
	it('rejects dangling and cyclic fixed-rule relationships', () => {
		const contribution = (attributes: unknown[]) => ({
			schemaVersion: 1,
			provider: '@fixture/rules',
			capabilities: {
				namespaces: [{ name: 'fixture', description: 'Fixture rules', attributes }]
			}
		});
		expect(() =>
			parseExactDeclarativeLanguageContribution(
				contribution([{ name: 'first', description: 'First', requires: ['missing'] }])
			)
		).toThrow('unknown attribute missing');
		expect(() =>
			parseExactDeclarativeLanguageContribution(
				contribution([
					{ name: 'first', description: 'First', requires: ['second'] },
					{ name: 'second', description: 'Second', requires: ['first'] }
				])
			)
		).toThrow('cyclic requires');
	});
});
