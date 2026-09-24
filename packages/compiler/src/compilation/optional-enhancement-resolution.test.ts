import { mkdtemp, mkdir, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import {
	isMissingExactOptionalEnhancement as isMissingOptionalEnhancement,
	isExactOptionalEnhancementPackageAbsent
} from './optional-enhancement-resolution.js';

it('accepts only resolution failures for the requested optional module', () => {
	const error = (message: string, code = 'MODULE_NOT_FOUND') =>
		Object.assign(new Error(message), { code });
	expect(isMissingOptionalEnhancement(error("Cannot find module '@ui/tone'"), '@ui/tone')).toBe(
		true
	);
	expect(
		isMissingOptionalEnhancement(
			error("Cannot find package '@ui/tone' imported from /app.js", 'ERR_MODULE_NOT_FOUND'),
			'@ui/tone'
		)
	).toBe(true);
	for (const failure of [
		error("Cannot find module '/app/node_modules/@ui/tone/missing.js'"),
		error("Cannot find module 'nested-dependency'"),
		error('Invalid exports in @ui/tone', 'ERR_INVALID_PACKAGE_CONFIG'),
		new Error("Cannot find module '@ui/tone'")
	])
		expect(isMissingOptionalEnhancement(failure, '@ui/tone')).toBe(false);
});

it('distinguishes absent packages from installed and dangling provider paths', async () => {
	const root = await mkdtemp(path.join(tmpdir(), 'exact-optional-provider-'));
	try {
		const importerDirectory = path.join(root, 'src', 'nested');
		const scope = path.join(root, 'node_modules', '@fixture');
		await mkdir(scope, { recursive: true });
		expect(
			await isExactOptionalEnhancementPackageAbsent('@fixture/missing/subpath', importerDirectory)
		).toBe(true);
		await mkdir(path.join(scope, 'installed'));
		expect(
			await isExactOptionalEnhancementPackageAbsent('@fixture/installed/subpath', importerDirectory)
		).toBe(false);
		await symlink(path.join(root, 'missing-target'), path.join(scope, 'linked'), 'junction');
		expect(
			await isExactOptionalEnhancementPackageAbsent('@fixture/linked', importerDirectory)
		).toBe(false);
		for (const request of ['./relative.js', '#mapped', 'node:fs', path.join(root, 'absolute.js')])
			expect(await isExactOptionalEnhancementPackageAbsent(request, importerDirectory)).toBe(false);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
