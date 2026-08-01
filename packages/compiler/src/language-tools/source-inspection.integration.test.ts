import { describe, expect, it } from 'vitest';
import { createExactLanguageService, type ExactSourceEntity } from '../index.js';

describe('compiler source inspection', () => {
	it('distinguishes the complete first-release component region vocabulary', async () => {
		const service = createExactLanguageService({ root: process.cwd(), noEmit: true });
		const source =
			'import { TaskContext } from "@exactjs/core";\nexport function Editor(this: Component<{ name: string }>) {\n\tthis.onMount(() => focus());\n\tasync function save(_task: TaskContext = TaskContext.latest()) {\n\t\tawait submit(this.state.name);\n\t}\n\tsave();\n\tconst upper = this.state.name.toUpperCase();\n\treturn () => (\n\t\t<input value:input={this.state.name} onInput={() => save()} aria-label={upper} />\n\t);\n}';
		await service.synchronize([{ kind: 'upsert', filename: 'Editor.tsx', version: 1, source }]);
		const inspection = await service.inspect('Editor.tsx');
		const kinds = inspection.components.flatMap(flatten).map((entity) => entity.kind);
		expect(kinds).toEqual(
			expect.arrayContaining([
				'component',
				'initializer',
				'render',
				'explicit-task',
				'derived',
				'binding',
				'interaction',
				'lifecycle'
			])
		);
		const task = inspection.components
			.flatMap(flatten)
			.find((entity) => entity.kind === 'explicit-task');
		expect(source.slice(task!.selectionRange.start, task!.selectionRange.end)).toBe('save');
		await service.dispose();
	});

	it('preserves referenced component placement in multiline JSX render expressions', async () => {
		const service = createExactLanguageService({ root: process.cwd(), noEmit: true });
		try {
			const source = `function CalculatorWorkspace(this: Component<{}>) {
	document.title = 'Calculator';
	return () => <section>Workspace</section>;
}

export function ShippingCalculatorPage(this: Component<{}>) {
	return () => (
		<main>
			<p>Ready · launch 🚀</p>
			<CalculatorWorkspace />
		</main>
	);
}`;
			await service.synchronize([{ kind: 'upsert', filename: 'Page.tsx', version: 1, source }]);
			const inspection = await service.inspect('Page.tsx');
			const page = inspection.components.find(
				(component) => component.name === 'ShippingCalculatorPage'
			);
			const workspace = page?.children
				.flatMap(flatten)
				.find((entity) => entity.name === 'CalculatorWorkspace');

			expect(workspace).toMatchObject({
				kind: 'render-expression',
				classification: {
					kind: 'render',
					referencedComponent: {
						placement: 'client',
						boundary: 'client'
					}
				}
			});
			expect(source.slice(workspace!.range.start, workspace!.range.end)).toContain(
				'<CalculatorWorkspace'
			);
			expect(source.slice(workspace!.selectionRange.start, workspace!.selectionRange.end)).toBe(
				'CalculatorWorkspace'
			);
		} finally {
			await service.dispose();
		}
	});

	it('classifies individual setup assignments as initialization or deferred reactive work', async () => {
		const service = createExactLanguageService({ root: process.cwd(), noEmit: true });
		const source = `import type { Component } from '@exactjs/core';
export function Summary(
	this: Component<{ base: number; total: number }>,
	{ multiplier }: { multiplier: number }
) {
	this.state.base = 2;
	this.state.total = this.state.base * multiplier;
	return () => null;
}`;
		try {
			await service.synchronize([{ kind: 'upsert', filename: 'Summary.tsx', version: 1, source }]);
			const inspection = await service.inspect('Summary.tsx');
			const assignments = inspection.components
				.flatMap(flatten)
				.filter((entity) => entity.classification?.kind === 'state-assignment');

			expect(assignments.map((entity) => entity.name)).toEqual(['state.base', 'state.total']);
			expect(
				assignments.map((entity) =>
					entity.classification?.kind === 'state-assignment'
						? entity.classification.execution
						: undefined
				)
			).toEqual(['once-per-instance', 'deferred-reactive']);
			expect(
				source.slice(assignments[0]!.selectionRange.start, assignments[0]!.selectionRange.end)
			).toBe('this.state.base');
		} finally {
			await service.dispose();
		}
	});

	it('retains symbol-resolved uses for derived reactive presentation', async () => {
		const service = createExactLanguageService({ root: process.cwd(), noEmit: true });
		const source = `import type { Component } from '@exactjs/core';
export function Summary(this: Component<{ price: number }>) {
	const doubled = this.state.price * 2;
	const label = String(doubled);
	return () => (
		<output>
			{doubled} / {label}
		</output>
	);
}`;
		try {
			await service.synchronize([{ kind: 'upsert', filename: 'Summary.tsx', version: 1, source }]);
			const inspection = await service.inspect('Summary.tsx');
			const doubled = inspection.components
				.flatMap(flatten)
				.find((entity) => entity.classification?.kind === 'derived' && entity.name === 'doubled');

			expect(doubled?.classification).toMatchObject({
				kind: 'derived',
				references: [
					{ start: source.indexOf('doubled', source.indexOf('const label')) },
					{ start: source.indexOf('doubled', source.indexOf('return')) }
				]
			});
			expect(
				doubled?.classification?.kind === 'derived'
					? doubled.classification.references.map((range) => source.slice(range.start, range.end))
					: []
			).toEqual(['doubled', 'doubled']);
		} finally {
			await service.dispose();
		}
	});

	it('shows only authored activation dependencies for explicit tasks', async () => {
		const service = createExactLanguageService({ root: process.cwd(), noEmit: true });
		const source =
			'import { TaskContext } from "@exactjs/core";\nimport type { Component } from \'@exactjs/core\';\nexport function Workspace(\n\tthis: Component<{ revision: number; draft: string; loading: boolean }>,\n\t{ initial }: { initial: { provider: string } }\n) {\n\tconst runFixtureTask = async (_revision, _task: TaskContext = TaskContext.latest()) => {\n\t\tconsume(this.state.draft, this.state.revision, this.state.loading, initial.provider);\n\t};\nrunFixtureTask(this.state.revision);\n\treturn () => null;\n}';
		try {
			await service.synchronize([
				{ kind: 'upsert', filename: 'Workspace.tsx', version: 1, source }
			]);
			const inspection = await service.inspect('Workspace.tsx');
			const task = inspection.components
				.flatMap(flatten)
				.find((entity) => entity.kind === 'explicit-task');

			expect(task?.classification).toMatchObject({
				kind: 'task',
				dependencies: [{ kind: 'state', path: 'this.state.revision' }]
			});
		} finally {
			await service.dispose();
		}
	});

	it('separates captured parameter defaults from task activation dependencies', async () => {
		const service = createExactLanguageService({ root: process.cwd(), noEmit: true });
		const source = `import { TaskContext, type Component } from '@exactjs/core';
export function Workspace(this: Component<{ revision: number; draft: string }>) {
	async function refresh(
		draft: string = this.state.draft,
		task: TaskContext = TaskContext.client().latest()
	) {
		await load(this.state.revision, draft, task.signal);
	}
	refresh();
	return () => null;
}`;
		try {
			await service.synchronize([
				{ kind: 'upsert', filename: 'CapturedTask.tsx', version: 1, source }
			]);
			const inspection = await service.inspect('CapturedTask.tsx');
			const task = inspection.components
				.flatMap(flatten)
				.find((entity) => entity.classification?.kind === 'task');

			expect(task?.classification).toMatchObject({
				kind: 'task',
				dependencies: [{ kind: 'state', path: 'this.state.revision' }],
				capturedInputs: [{ parameter: 0, kind: 'state', path: 'this.state.draft' }]
			});
		} finally {
			await service.dispose();
		}
	});

	it('keeps function-defined task hover on its identifier and omits embedded awaits', async () => {
		const service = createExactLanguageService({ root: process.cwd(), noEmit: true });
		const source = `import { TaskContext, type Component } from '@exactjs/core';
export function Rates(this: Component<{ providers: unknown[] }>) {
	const loadInitialRates = async (
		url: string,
		task: TaskContext = TaskContext.server().blocking()
	) => {
		const providers = await Promise.all(loadProviders(url, task.signal));
		this.state.providers = providers;
	};
	loadInitialRates('/rates');
	return () => null;
}`;
		try {
			await service.synchronize([{ kind: 'upsert', filename: 'Rates.tsx', version: 1, source }]);
			const inspection = await service.inspect('Rates.tsx');
			const tasks = inspection.components
				.flatMap(flatten)
				.filter((entity) => entity.classification?.kind === 'task');

			expect(tasks).toHaveLength(1);
			expect(source.slice(tasks[0]!.selectionRange.start, tasks[0]!.selectionRange.end)).toBe(
				'loadInitialRates'
			);
			expect(tasks[0]!.selectionRange.start).toBeGreaterThanOrEqual(tasks[0]!.range.start);
			expect(tasks[0]!.selectionRange.end).toBeLessThanOrEqual(tasks[0]!.range.end);
			expect(
				tasks.some((task) => task.selectionRange.start === source.indexOf('await Promise.all'))
			).toBe(false);
		} finally {
			await service.dispose();
		}
	});

	it('names inferred dependencies from authored destructured bindings', async () => {
		const service = createExactLanguageService({ root: process.cwd(), noEmit: true });
		const source = `import type { Component } from '@exactjs/core';
export async function Product(
	this: Component<{ name?: string }>,
	{ productId }: { productId: string }
) {
	this.state.name = await loadProduct(productId);
	return () => <h1>{this.state.name}</h1>;
}`;
		try {
			await service.synchronize([{ kind: 'upsert', filename: 'Product.tsx', version: 1, source }]);
			const inspection = await service.inspect('Product.tsx');
			const task = inspection.components
				.flatMap(flatten)
				.find((entity) => entity.kind === 'inferred-task');

			expect(task?.classification).toMatchObject({
				kind: 'task',
				dependencies: [{ kind: 'prop', path: 'productId' }]
			});
		} finally {
			await service.dispose();
		}
	});

	it('publishes only current framework diagnostics across consecutive edits', async () => {
		const service = createExactLanguageService({ root: process.cwd(), noEmit: true });
		const clean =
			'import { TaskContext } from "@exactjs/core";\nimport type { Component } from \'@exactjs/core\';\nexport function Page(this: Component<{}>) {\n\tconst runFixtureTask = (_task: TaskContext = TaskContext.server()) => {};\nrunFixtureTask();\n\treturn () => null;\n}';
		const conflicting = clean.replace(
			'(_task: TaskContext = TaskContext.server()) => {};',
			"(_task: TaskContext = TaskContext.server()) => { document.title = 'foobar'; };"
		);
		try {
			for (const [index, source] of [clean, conflicting, clean].entries()) {
				await service.synchronize([
					{ kind: 'upsert', filename: 'DiagnosticPage.tsx', version: index + 1, source }
				]);
				const inspection = await service.inspect('DiagnosticPage.tsx');
				expect(inspection.generation).toBe(index + 1);
				expect(
					inspection.diagnostics.every((diagnostic) => diagnostic.code.startsWith('EXACT'))
				).toBe(true);
				expect(inspection.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(
					index === 1 ? ['EXACT2001'] : []
				);
			}
		} finally {
			await service.dispose();
		}
	});
});

function flatten(entity: ExactSourceEntity): ExactSourceEntity[] {
	return [entity, ...entity.children.flatMap(flatten)];
}
