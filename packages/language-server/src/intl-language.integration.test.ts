import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ExactLanguageWorkspaceManager } from './workspace-manager.js';

describe('intl language extension integration', () => {
	it('surfaces compiler-matched inference and catalog coverage through the LSP workspace', async () => {
		const root = fileURLToPath(new URL('../../../', import.meta.url));
		const filename = path.join(root, 'apps', 'intl-testbed', 'src', 'showcase.tsx');
		const uri = pathToFileURL(filename).href;
		const source = await readFile(filename, 'utf8');
		const position = source.indexOf('panel-title');
		const manager = new ExactLanguageWorkspaceManager([root], true);
		try {
			const synchronized = await manager.synchronizeDocument(uri, 1, source);
			expect(synchronized).toBeDefined();
			expect(synchronized?.inspection.diagnostics).not.toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						code: expect.stringMatching(/EXACT6007|EXACT_COMPONENT_BINDING/u),
						summary: expect.stringContaining('fragment')
					})
				])
			);
			const hover = await manager.hover(uri, position);
			const hints = await manager.inlayHints(uri, { start: 0, end: source.length });
			expect(hover).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						provider: '@exactjs/intl',
						value: expect.objectContaining({
							markdown: expect.stringMatching(
								/plain message interpolation[\s\S]*ar-EG, fr-FR, ja-JP/u
							)
						})
					})
				])
			);
			expect(await manager.providerStatus(uri)).toEqual(
				expect.arrayContaining([expect.objectContaining({ id: '@exactjs/intl', health: 'ready' })])
			);
			expect(hints).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						provider: '@exactjs/intl',
						value: expect.objectContaining({ label: expect.stringContaining('plural cardinal') })
					}),
					expect.objectContaining({
						provider: '@exactjs/intl',
						value: expect.objectContaining({ label: expect.stringContaining('formatter-only') })
					})
				])
			);
		} finally {
			await manager.dispose();
		}
	}, 20_000);

	it('reports a local binding that duplicates the package-scoped namespace', async () => {
		const root = fileURLToPath(new URL('../../../', import.meta.url));
		const filename = path.join(root, 'apps', 'intl-testbed', 'src', 'showcase.tsx');
		const uri = pathToFileURL(filename).href;
		const source = `import * as intl from '@exactjs/intl/enhancements' with { type: 'exact-enhancement' };\n${await readFile(filename, 'utf8')}`;
		const manager = new ExactLanguageWorkspaceManager([root], true);
		try {
			const synchronized = await manager.synchronizeDocument(uri, 1, source);
			expect(synchronized?.inspection.diagnostics).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						code: 'EXACT6017',
						summary: expect.stringContaining('already declared as a package-scoped enhancement')
					})
				])
			);
		} finally {
			await manager.dispose();
		}
	}, 20_000);
});
