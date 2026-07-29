import { afterEach, describe, expect, it } from 'vitest';
import {
	clearExpressionProjectCache,
	createExactLanguageService,
	type ExactRefactorPlan,
	type ExactSourceEntity
} from '../index.js';

afterEach(() => clearExpressionProjectCache());

describe('compiler-planned task refactors', () => {
	it('round trips one simple inferred task through normalized explicit source', async () => {
		const service = createExactLanguageService({ root: process.cwd(), noEmit: true });
		let source = `export async function Page(
	this: Component<{ value?: string }>,
	props: { id: string }
) {
	this.state.value = await load(props.id);
	return () => <main>{this.state.value}</main>;
}`;
		await service.synchronize([{ kind: 'upsert', filename: 'Page.tsx', version: 1, source }]);
		let inspection = await service.inspect('Page.tsx');
		const inferred = tasks(inspection.components[0]!)[0]!;
		const explicitPlan = await service.refactor({
			generation: inspection.generation,
			filename: 'Page.tsx',
			range: inferred.range,
			kind: 'convert-to-explicit-task'
		});
		expect(explicitPlan?.semanticChange).toBe('none');
		source = apply(source, explicitPlan!);
		expect(source).toContain('this.task.blocking(props.id, async (id)');
		expect(source).not.toContain('export async function');

		await service.synchronize([{ kind: 'upsert', filename: 'Page.tsx', version: 2, source }]);
		inspection = await service.inspect('Page.tsx');
		const explicit = tasks(inspection.components[0]!)[0]!;
		const inferredPlan = await service.refactor({
			generation: inspection.generation,
			filename: 'Page.tsx',
			range: explicit.range,
			kind: 'convert-to-inferred-task'
		});
		expect(inferredPlan?.semanticChange).toBe('none');
		const roundTrip = apply(source, inferredPlan!);
		expect(roundTrip).toContain('export async function Page');
		expect(roundTrip).toContain('this.state.value = await load(props.id);');
		await service.dispose();
	});

	it('withholds explicit-to-inferred conversion for nonblocking work', async () => {
		const service = createExactLanguageService({ root: process.cwd(), noEmit: true });
		const source = `export function Page(this: Component<{}>) {
	this.task.client(async () => report(await load()));
	return () => <main />;
}`;
		await service.synchronize([{ kind: 'upsert', filename: 'Page.tsx', version: 1, source }]);
		const inspection = await service.inspect('Page.tsx');
		const explicit = tasks(inspection.components[0]!)[0]!;
		await expect(
			service.refactor({
				generation: inspection.generation,
				filename: 'Page.tsx',
				range: explicit.range,
				kind: 'convert-to-inferred-task'
			})
		).resolves.toBeUndefined();
		await service.dispose();
	});
});

function tasks(entity: ExactSourceEntity): ExactSourceEntity[] {
	const descendants = [entity, ...entity.children.flatMap(tasks)];
	return descendants.filter(
		(candidate) => candidate.kind === 'inferred-task' || candidate.kind === 'explicit-task'
	);
}

function apply(source: string, plan: ExactRefactorPlan): string {
	let result = source;
	for (const edit of [...plan.edits].sort((left, right) => right.range.start - left.range.start))
		result = `${result.slice(0, edit.range.start)}${edit.newText}${result.slice(edit.range.end)}`;
	return result;
}
