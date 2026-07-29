import { describe, expect, it } from 'vitest';
import { afterEach } from 'vitest';
import { clearExpressionProjectCache, transformSource } from '../index.js';
import { createExactRuntimeInspectionCorrelation } from './runtime-correlation.js';

afterEach(() => clearExpressionProjectCache());

describe('runtime inspection correlation', () => {
	it('uses canonical source IDs without source descriptions', () => {
		const source = `function Panel() {
			this.task(async () => Promise.resolve('data'));
			return () => <p>{this.state.value}</p>;
		}`;
		const inspection = transformSource(source, {
			filename: '/src/Panel.tsx',
			emitInspection: true
		}).inspectionCatalog!;
		const correlation = createExactRuntimeInspectionCorrelation(inspection);
		const explicit = inspection.components[0]!.children
			.flatMap((entity) => entity.children)
			.find((entity) => entity.kind === 'explicit-task');

		expect(correlation.components[0]!.slots).toContainEqual({
			id: explicit!.id,
			kind: 'explicit-task'
		});
		expect(JSON.stringify(correlation)).not.toContain('/src/Panel.tsx');
		expect(JSON.stringify(correlation)).not.toContain('Promise');
	});
});
