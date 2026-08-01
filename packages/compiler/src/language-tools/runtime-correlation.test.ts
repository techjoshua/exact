import { describe, expect, it } from 'vitest';
import { afterEach } from 'vitest';
import { clearExpressionProjectCache, transformSource } from '../index.js';
import { createExactRuntimeInspectionCorrelation } from './runtime-correlation.js';

afterEach(() => clearExpressionProjectCache());

describe('runtime inspection correlation', () => {
	it('uses canonical source IDs without source descriptions', () => {
		const source =
			'import { TaskContext } from "@exactjs/core";\nfunction Panel() {\n\t\t\tconst runFixtureTask = async (_task: TaskContext = TaskContext.latest()) => Promise.resolve(\'data\');\nrunFixtureTask();\n\t\t\treturn () => <p>{this.state.value}</p>;\n\t\t}';
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

	it('marks task callbacks with their canonical compiler ID', () => {
		const result = transformSource(
			'import { TaskContext } from "@exactjs/core";\nfunction Panel() {\n\t\t\t\tconst runFixtureTask = async (_task: TaskContext = TaskContext.latest()) => Promise.resolve(\'data\');\nrunFixtureTask();\n\t\t\t\treturn () => <p>{this.state.value}</p>;\n\t\t\t}',
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

		expect(result.code).toContain('markExactInspectionSource');
		expect(result.code).toContain(JSON.stringify(task.id));
	});
});
