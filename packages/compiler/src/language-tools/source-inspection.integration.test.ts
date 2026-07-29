import { describe, expect, it } from 'vitest';
import { createExactLanguageService, type ExactSourceEntity } from '../index.js';

describe('compiler source inspection', () => {
	it('distinguishes the complete first-release component region vocabulary', async () => {
		const service = createExactLanguageService({ root: process.cwd(), noEmit: true });
		const source = `export function Editor(this: Component<{ name: string }>) {
	this.onMount(() => focus());
	const save = this.action('Save', async () => submit(this.state.name));
	this.task(() => save());
	const upper = this.state.name.toUpperCase();
	return () => (
		<input value:input={this.state.name} onInput={() => save()} aria-label={upper} />
	);
}`;
		await service.synchronize([{ kind: 'upsert', filename: 'Editor.tsx', version: 1, source }]);
		const inspection = await service.inspect('Editor.tsx');
		const kinds = inspection.components.flatMap(flatten).map((entity) => entity.kind);
		expect(kinds).toEqual(
			expect.arrayContaining([
				'component',
				'initializer',
				'render',
				'action',
				'explicit-task',
				'derived',
				'binding',
				'interaction',
				'lifecycle'
			])
		);
		const action = inspection.components
			.flatMap(flatten)
			.find((entity) => entity.kind === 'action');
		const task = inspection.components
			.flatMap(flatten)
			.find((entity) => entity.kind === 'explicit-task');
		expect(source.slice(action!.selectionRange.start, action!.selectionRange.end)).toBe('action');
		expect(source.slice(task!.selectionRange.start, task!.selectionRange.end)).toBe('task');
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

	it('publishes only current framework diagnostics across consecutive edits', async () => {
		const service = createExactLanguageService({ root: process.cwd(), noEmit: true });
		const clean = `import type { Component } from '@exactjs/core';
export function Page(this: Component<{}>) {
	this.task.server(() => {});
	return () => null;
}`;
		const conflicting = clean.replace(
			'this.task.server(() => {});',
			"this.task.server(() => { document.title = 'foobar'; });"
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
