import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect, it, onTestFinished } from 'vitest';
import { createExactWebpackLanguageIntegration } from './language-integration.js';

it('retains a consumed configuration dependency until the next watch generation', async () => {
	const root = await mkdtemp(path.join(os.tmpdir(), 'exact-webpack-config-'));
	onTestFinished(() => rm(root, { recursive: true, force: true }));
	const filename = path.join(root, 'exact.config.mjs');
	await writeFile(filename, 'export default {};');
	const language = createExactWebpackLanguageIntegration({ applicationRoot: root });
	onTestFinished(() => language.dispose());
	await language.packageEnhancements();
	// Deletion during a build must invalidate the configuration that build consumed.
	await rm(filename);
	expect(await language.watchFiles()).toContainEqual({ filename, missing: false });
	language.invalidate(filename);
	expect(await language.watchFiles()).toContainEqual({ filename, missing: true });
	await writeFile(filename, 'export default {};');
	language.invalidate(filename);
	expect(await language.watchFiles()).toContainEqual({ filename, missing: false });
});
