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
		const correlation = createExactRuntimeInspectionCorrelation(inspection, {
			statePaths: ['state.credentials.token'],
			contextTokens: [{ name: 'database', scope: 'component', kind: 'server-resource' }],
			secretNames: ['apiKey']
		});
		const explicit = inspection.components[0]!.children.flatMap((entity) => entity.children).find(
			(entity) => entity.kind === 'explicit-task'
		);

		expect(correlation.components[0]!.slots).toContainEqual({
			id: explicit!.id,
			kind: 'explicit-task'
		});
		expect(JSON.stringify(correlation)).not.toContain('/src/Panel.tsx');
		expect(JSON.stringify(correlation)).not.toContain('Promise');
		expect(correlation.redactions).toEqual({
			statePaths: ['state.credentials.token'],
			contextTokens: [{ name: 'database', scope: 'component', kind: 'server-resource' }],
			secretNames: ['apiKey']
		});
		expect(JSON.stringify(correlation)).not.toContain('must-never-appear');
	});

	it('marks each task and action callback with its canonical compiler ID', () => {
		const result = transformSource(
			`function Panel() {
				this.task(async () => Promise.resolve('data'));
				this.action('Save', async () => Promise.resolve());
				return () => <p>{this.state.value}</p>;
			}`,
			{
				filename: '/src/Panel.tsx',
				emitInspection: true,
				instrumentInspection: true
			}
		);
		const entities = result.inspectionCatalog!.components[0]!.children.flatMap(
			(entity) => entity.children
		);
		const task = entities.find((entity) => entity.kind === 'explicit-task')!;
		const action = entities.find((entity) => entity.kind === 'action')!;

		expect(result.code).toContain('markExactInspectionSource');
		expect(result.code).toContain(JSON.stringify(task.id));
		expect(result.code).toContain(JSON.stringify(action.id));
		expect(task.id).not.toBe(action.id);
	});
});
