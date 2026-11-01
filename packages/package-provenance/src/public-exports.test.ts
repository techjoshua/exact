import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { it, onTestFinished } from 'vitest';
import { verifyPackageExportContainment } from '../../component-composition-corpus/test-support/package-export-journey.mjs';
import * as api from './public-exports.js';

it('resolves public dot-prefixed files without weakening physical containment or private exports', async () => {
	const root = await mkdtemp(path.join(os.tmpdir(), 'exact-public-exports-'));
	onTestFinished(() => rm(root, { recursive: true, force: true }));
	await verifyPackageExportContainment(api, root);
});
