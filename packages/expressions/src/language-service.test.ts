import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createExpressionLanguageService } from './language-service.js';

const root = path.resolve(import.meta.dirname, '../../..');
const config = path.join(root, 'apps/kanban/tsconfig.json');
const sourceRoot = path.join(root, 'apps/kanban/src');

describe('ExpressionLanguageService', () => {
	it('propagates public shape changes to diagnostic-changing consumers', () => {
		const service = createExpressionLanguageService({ tsconfigPath: config });
		const model = path.join(sourceRoot, '__language_model.ts');
		const consumer = path.join(sourceRoot, '__language_consumer.ts');
		try {
			const baseline = service.synchronize([
				{
					kind: 'upsert',
					filename: model,
					source:
						'export interface Model { value: number }\nexport const model: Model = { value: 1 };'
				},
				{
					kind: 'upsert',
					filename: consumer,
					source:
						'import { model } from "./__language_model.js";\nexport const value: number = model.value;'
				}
			]);
			expect(baseline.affectedFiles).toEqual([]);

			const update = service.synchronize([
				{
					kind: 'upsert',
					filename: model,
					source:
						'export interface Model { value: string }\nexport const model: Model = { value: "changed" };'
				}
			]);
			expect(update.affectedFiles).toEqual(
				expect.arrayContaining([model.replaceAll('\\', '/'), consumer.replaceAll('\\', '/')])
			);
			expect(update.diagnostics).toContainEqual(
				expect.objectContaining({
					code: 'TS2322',
					filename: consumer.replaceAll('\\', '/')
				})
			);
		} finally {
			service.dispose();
		}
	});

	it('limits implementation-only updates to the changed leaf', () => {
		const service = createExpressionLanguageService({ tsconfigPath: config });
		const filename = path.join(sourceRoot, '__language_leaf.ts');
		try {
			service.synchronize([{ kind: 'upsert', filename, source: 'export const value = 1;' }]);
			const update = service.synchronize([
				{ kind: 'upsert', filename, source: 'export const value = 2;' }
			]);
			expect(update.affectedFiles).toEqual([filename.replaceAll('\\', '/')]);
			expect(update.diagnostics).toEqual([]);
			expect(service.stats().generations).toBe(2);
		} finally {
			service.dispose();
		}
	});

	it('applies batched overlays and deletions without retaining stale snapshots', () => {
		const service = createExpressionLanguageService({ tsconfigPath: config });
		const first = path.join(sourceRoot, '__language_batch_first.ts');
		const second = path.join(sourceRoot, '__language_batch_second.ts');
		try {
			service.synchronize([
				{ kind: 'upsert', filename: first, source: 'export const first = 1;' },
				{
					kind: 'upsert',
					filename: second,
					source:
						'import { first } from "./__language_batch_first.js"; export const second = first;'
				}
			]);
			const baselineSnapshots = service.stats().snapshots;
			for (let revision = 0; revision < 20; revision++) {
				service.synchronize([
					{
						kind: 'upsert',
						filename: first,
						source: `export const first = ${revision};`
					}
				]);
			}
			expect(service.stats().snapshots).toBeLessThanOrEqual(baselineSnapshots + 1);
			const deleted = service.synchronize([{ kind: 'delete', filename: second }]);
			expect(deleted.changedFiles).toEqual([second.replaceAll('\\', '/')]);
			expect(service.stats().scripts).not.toBe(0);
		} finally {
			service.dispose();
		}
	});

	it('rejects work after disposal', () => {
		const service = createExpressionLanguageService({ tsconfigPath: config });
		service.dispose();
		expect(() => service.synchronize([])).toThrow('disposed');
	});

	it.runIf(process.platform === 'win32')(
		'case-folds identity without lowercasing reported filenames',
		() => {
			const service = createExpressionLanguageService({ tsconfigPath: config });
			const filename = path.join(sourceRoot, '__Language_Casing.ts');
			const alternate = `${
				filename[0] === filename[0]!.toUpperCase()
					? filename[0]!.toLowerCase()
					: filename[0]!.toUpperCase()
			}${filename.slice(1)}`;
			const displayed = filename.replaceAll('\\', '/');
			try {
				service.synchronize([
					{ kind: 'upsert', filename, source: 'export const value: number = 1;' }
				]);
				const update = service.synchronize([
					{
						kind: 'upsert',
						filename: alternate,
						source: 'export const value: number = "wrong";'
					}
				]);
				expect(update.changedFiles).toEqual([displayed]);
				expect(
					update.affectedFiles.filter(
						(candidate) => candidate.toLowerCase() === displayed.toLowerCase()
					)
				).toEqual([displayed]);
				expect(update.diagnostics).toContainEqual(
					expect.objectContaining({
						code: 'TS2322',
						filename: displayed
					})
				);
			} finally {
				service.dispose();
			}
		}
	);
});
