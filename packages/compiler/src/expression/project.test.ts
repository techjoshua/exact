import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
	clearExpressionProjectCache,
	createCompilerSession,
	expressionModuleFor
} from './session.js';

describe('shared expression projects', () => {
	it('emits compiler and nested expression profile events when enabled', () => {
		const events: Array<{ subsystem: string; phase: string }> = [];
		const session = createCompilerSession({ onProfile: (event) => events.push(event) });
		try {
			session.expressionModuleFor('__profiled_compiler.ts', 'export const value = 1;');
			session.expressionModuleFor('__profiled_compiler.ts', 'export const value = 1;');

			expect(events).toContainEqual(
				expect.objectContaining({ subsystem: 'compiler', phase: 'expression-module' })
			);
			expect(events).toContainEqual(
				expect.objectContaining({ subsystem: 'expressions', phase: 'module-projection' })
			);
		} finally {
			session.dispose();
		}
	});

	it('caches modules by canonical filename within one project', () => {
		clearExpressionProjectCache();
		const root = path.resolve(import.meta.dirname, '../../../..');
		const firstFile = path.join(root, 'apps/kanban/src/__cache_first.ts');
		const secondFile = path.join(root, 'apps/kanban/src/__cache_second.ts');
		const source = 'export const same = 1;';
		const first = expressionModuleFor(firstFile, source);
		const second = expressionModuleFor(secondFile, source);
		expect(first.filename).not.toBe(second.filename);
		expect(first).not.toBe(second);
		expect(expressionModuleFor(firstFile, source)).toBe(first);
	});

	it('rebinds unchanged consumers after a dependency revision', () => {
		clearExpressionProjectCache();
		const root = path.resolve(import.meta.dirname, '../../../..');
		const model = path.join(root, 'apps/kanban/src/__cache_model.ts');
		const consumer = path.join(root, 'apps/kanban/src/__cache_consumer.ts');
		const consumerSource =
			'import { value } from "./__cache_model.js"; export const result = value;';
		expressionModuleFor(model, 'export const value = 1;');
		const first = expressionModuleFor(consumer, consumerSource);
		expect(
			first
				.walk()
				.references()
				.first((reference) => reference.name === 'result')?.variable?.type?.kind
		).toBe('number');
		expressionModuleFor(model, 'export const value = "changed";');
		const rebound = expressionModuleFor(consumer, consumerSource);
		expect(rebound).not.toBe(first);
		expect(
			rebound
				.walk()
				.references()
				.first((reference) => reference.name === 'result')?.variable?.type?.kind
		).toBe('string');
	});

	it('invalidates consumers of side-effect-only imports resolved by TypeScript', () => {
		clearExpressionProjectCache();
		const root = path.resolve(import.meta.dirname, '../../../..');
		const setup = path.join(root, 'apps/kanban/src/__cache_setup.ts');
		const consumer = path.join(root, 'apps/kanban/src/__cache_side_effect.ts');
		const source = 'import "./__cache_setup.js"; export const ready = true;';
		expressionModuleFor(setup, "globalThis.name = 'first';");
		const first = expressionModuleFor(consumer, source);
		expressionModuleFor(setup, "globalThis.name = 'second';");
		expect(expressionModuleFor(consumer, source)).not.toBe(first);
	});

	it('shares relative filenames through a configured package workspace', () => {
		clearExpressionProjectCache();
		const root = path.resolve(import.meta.dirname, '../../../..');
		expressionModuleFor('apps/kanban/src/__relative_cache_model.ts', 'export const value = 1;', {
			root
		});
		const consumer = expressionModuleFor(
			'apps/kanban/src/__relative_cache_consumer.ts',
			'import { value } from "./__relative_cache_model.js"; export const result = value;',
			{ root }
		);
		expect(
			consumer
				.walk()
				.references()
				.first((reference) => reference.name === 'result')?.variable?.type?.kind
		).toBe('number');
	});

	it('keeps script-mode relative snippets isolated inside the shared workspace', () => {
		clearExpressionProjectCache();
		const first = expressionModuleFor('__relative_first.ts', 'const sharedName = 1;');
		const second = expressionModuleFor('__relative_second.ts', 'const sharedName = 2;');
		expect(first.diagnostics.filter((diagnostic) => diagnostic.severity === 'error')).toEqual([]);
		expect(second.diagnostics.filter((diagnostic) => diagnostic.severity === 'error')).toEqual([]);
	});

	it('uses language-service affected files to invalidate transitive consumers', () => {
		const root = path.resolve(import.meta.dirname, '../../../..');
		const model = path.join(root, 'apps/kanban/src/__session_language_model.ts');
		const consumer = path.join(root, 'apps/kanban/src/__session_language_consumer.ts');
		const modelSource =
			'export interface Model { value: number }\nexport const model: Model = { value: 1 };';
		const consumerSource =
			'import { model } from "./__session_language_model.js";\nexport const value: number = model.value;';
		const session = createCompilerSession({ languageService: true });
		try {
			fs.writeFileSync(model, modelSource);
			fs.writeFileSync(consumer, consumerSource);
			session.expressionModuleFor(model, modelSource);
			const firstConsumer = session.expressionModuleFor(consumer, consumerSource);

			fs.writeFileSync(
				model,
				'export interface Model { value: string }\nexport const model: Model = { value: "changed" };'
			);
			const update = session.invalidate(model);
			expect(update.affectedFiles).toEqual(expect.arrayContaining([model, consumer]));
			expect(update.diagnostics).toContainEqual(
				expect.objectContaining({
					code: 'TS2322',
					filename: consumer.replaceAll('\\', '/')
				})
			);
			expect(session.expressionModuleFor(consumer, consumerSource)).not.toBe(firstConsumer);
			expect(session.stats().languageServices).toBe(1);
		} finally {
			session.dispose();
			fs.rmSync(model, { force: true });
			fs.rmSync(consumer, { force: true });
		}
	});
});
