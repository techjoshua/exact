import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, it, vi } from 'vitest';
import { withLibraryOutput } from './output.js';

vi.mock('node:fs/promises', async (original) => {
	const filesystem = await original<typeof import('node:fs/promises')>();
	return { ...filesystem, rm: vi.fn(filesystem.rm) };
});

it('retains the previous generation when failed output cannot be removed during rollback', async () => {
	const root = await mkdtemp(path.join(tmpdir(), 'exact-library-recovery-'));
	try {
		await mkdir(path.join(root, 'dist'));
		await writeFile(path.join(root, 'dist/previous'), 'recoverable');
		await expect(
			withLibraryOutput(root, false, async () => {
				// Windows can refuse removal when another process has an output file open.
				vi.mocked(rm).mockRejectedValueOnce(
					Object.assign(new Error('output is busy'), { code: 'EPERM' })
				);
				throw new Error('failed compilation');
			})
		).rejects.toThrow(/previous output remains at/);
		const backup = (await readdir(root)).find((name) => name.startsWith('.exact-library-build-'));
		expect(backup).toBeDefined();
		expect(await readFile(path.join(root, backup!, 'previous/previous'), 'utf8')).toBe(
			'recoverable'
		);
		await expect(readdir(path.join(root, '.exact-library-build.lock'))).rejects.toMatchObject({
			code: 'ENOENT'
		});
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
