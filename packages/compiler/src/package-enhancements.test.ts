import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { transformSource } from './index.js';
import type { ExactPackageEnhancementImport } from '@exactjs/config';

const intlRegistration: ExactPackageEnhancementImport = Object.freeze({
	localName: 'intl',
	moduleSpecifier: '@exactjs/intl/enhancements',
	importKind: 'namespace',
	declaredIn: path.resolve('apps/intl-testbed/exact.config.ts')
});

describe('package-scoped enhancements', () => {
	it('keeps distinct activators from a package-scoped namespace associated with their components', () => {
		const transformed = transformSource(
			`export function Greeting() {
				return () => <article intl:locale><h2 intl:message="title">Hello</h2></article>;
			}`,
			{
				filename: path.resolve('apps/intl-testbed/src/Greeting.tsx'),
				packageEnhancements: [intlRegistration]
			}
		);

		expect(transformed.rendererEnhancements).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ exportName: 'locale' }),
				expect.objectContaining({ exportName: 'default' })
			])
		);
	});

	it('rejects locale literals outside the intl locale-string contract', () => {
		expect(() =>
			transformSource(
				'export function View() { return () => <article intl:locale="not-a-locale" />; }',
				{
					filename: path.resolve('apps/intl-testbed/src/InvalidLocale.tsx'),
					packageEnhancements: [intlRegistration]
				}
			)
		).toThrow(/locale|public prop union/u);
	});

	it('provides a virtual namespace and emits only an activated enhancement registration', () => {
		const used = transformSource(
			`export function Greeting() {
				return () => <p intl:message>Hello</p>;
			}`,
			{
				filename: path.resolve('Greeting.tsx'),
				packageEnhancements: [intlRegistration]
			}
		);
		const unused = transformSource(
			`export function Plain() {
				return () => <p>Hello</p>;
			}`,
			{
				filename: path.resolve('Plain.tsx'),
				packageEnhancements: [intlRegistration]
			}
		);

		expect(used.rendererEnhancements).toHaveLength(1);
		expect(used.code).not.toContain('exact-enhancement');
		expect(unused.rendererEnhancements).toBeUndefined();
	});

	it('rejects an authored enhancement import with the package binding name', () => {
		expect(() =>
			transformSource(
				`import * as intl from '@exactjs/intl/enhancements' with { type: 'exact-enhancement' };
				export function Greeting() { return () => <p intl:message>Hello</p>; }`,
				{
					filename: path.resolve('Duplicate.tsx'),
					packageEnhancements: [intlRegistration]
				}
			)
		).toThrow(
			/duplicate identifier "intl"; it is already declared as a package-scoped enhancement/u
		);
	});
});
