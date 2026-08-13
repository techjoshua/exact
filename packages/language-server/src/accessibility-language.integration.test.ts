import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ExactLanguageWorkspaceManager } from './workspace-manager.js';

describe('accessibility language extension integration', () => {
	it('loads from package scope and returns package-owned diagnostics, hover, and inlays', async () => {
		const root = fileURLToPath(new URL('../../../', import.meta.url));
		const filename = path.join(
			root,
			'packages',
			'language-server',
			'test-fixtures',
			'accessibility-project',
			'page.tsx'
		);
		const uri = pathToFileURL(filename).href;
		const source = await readFile(filename, 'utf8');
		const manager = new ExactLanguageWorkspaceManager([root], true);
		try {
			const synchronized = await manager.synchronizeDocument(uri, 1, source);
			expect(synchronized?.providerDiagnostics).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						provider: '@exactjs/accessibility',
						diagnostic: expect.objectContaining({ code: 'positive-tabindex' })
					}),
					expect.objectContaining({
						provider: '@exactjs/accessibility',
						diagnostic: expect.objectContaining({ code: 'no-provable-accessible-name' })
					}),
					expect.objectContaining({
						provider: '@exactjs/accessibility',
						diagnostic: expect.objectContaining({ code: 'unsupported-navigation-role' })
					})
				])
			);
			expect(await manager.providerStatus(uri)).toEqual(
				expect.arrayContaining([
					expect.objectContaining({ id: '@exactjs/accessibility', health: 'ready' })
				])
			);
			const position = source.indexOf('a11y:navigate') + 7;
			const hover = await manager.hover(uri, position);
			expect(hover).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						provider: '@exactjs/accessibility',
						value: expect.objectContaining({ markdown: expect.stringContaining('a11y:navigate') })
					})
				])
			);
			const hints = await manager.inlayHints(uri, { start: 0, end: source.length });
			expect(hints).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						provider: '@exactjs/accessibility',
						value: expect.objectContaining({
							label: expect.stringContaining('tree keyboard policy')
						})
					})
				])
			);
		} finally {
			await manager.dispose();
		}
	}, 20_000);
});
