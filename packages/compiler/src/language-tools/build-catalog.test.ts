import { describe, expect, it } from 'vitest';
import {
	createExactBuildInspectionCatalog,
	exactInspectionSourceHash
} from './build-catalog.js';
import { clearExpressionProjectCache, transformSource } from '../index.js';
import { afterEach } from 'vitest';

afterEach(() => clearExpressionProjectCache());

describe('build-scoped inspection catalogs', () => {
	it('normalizes paths, adds coordinates, and never retains source text', () => {
		const source = `function Card() {\n\treturn () => <p>{this.state.total}</p>;\n}`;
		const filename = 'C:\\workspace\\src\\Card.tsx';
		const inspection = transformSource(source, {
			filename,
			emitInspection: true
		}).inspectionCatalog!;
		const catalog = createExactBuildInspectionCatalog({
			buildKey: 'build-1',
			root: 'C:\\workspace',
			roots: [
				{
					executionRoot: 'page',
					rootComponentId: inspection.components[0]!.id,
					inspections: [inspection],
					sources: { [filename]: source }
				}
			]
		});

		const file = catalog.roots.page!.files[0]!;
		expect(file.path).toBe('src/Card.tsx');
		expect(file.sourceHash).toBe(exactInspectionSourceHash(source));
		expect(file.components[0]!.location.start.line).toBe(1);
		expect(JSON.stringify(catalog)).not.toContain(source);
	});

	it('rejects sources outside the project', () => {
		const inspection = transformSource('function Card() {}', {
			filename: 'C:\\other\\Card.tsx',
			emitInspection: true
		}).inspectionCatalog!;
		expect(() =>
			createExactBuildInspectionCatalog({
				buildKey: 'build-1',
				root: '/workspace',
				roots: [
					{
						executionRoot: 'page',
						rootComponentId: 'component:Card',
						inspections: [inspection],
						sources: { 'C:\\other\\Card.tsx': 'function Card() {}' }
					}
				]
			})
		).toThrow('outside');
	});
});
