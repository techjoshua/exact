import {
	chmod,
	link,
	mkdir,
	mkdtemp,
	readFile,
	readdir,
	rename,
	rm,
	stat,
	writeFile
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, it, vi } from 'vitest';
import { withLibraryOutput } from './output.js';

vi.mock('node:fs/promises', async (original) => {
	const filesystem = await original<typeof import('node:fs/promises')>();
	return { ...filesystem, rename: vi.fn(filesystem.rename), link: vi.fn(filesystem.link) };
});

it.each(['unsupported links', 'changed permissions'])(
	'publishes verified bytes with %s without reusing the old file',
	async (mode) => {
		const root = await mkdtemp(path.join(tmpdir(), 'exact-library-link-fallback-'));
		try {
			await mkdir(path.join(root, 'dist'));
			const filename = path.join(root, 'dist/value.js');
			await writeFile(filename, 'verified');
			const previous = await stat(filename);
			await withLibraryOutput(root, false, async (output) => {
				await writeFile(path.join(output, 'value.js'), 'verified');
				if (mode === 'changed permissions') await chmod(path.join(output, 'value.js'), 0o600);
				else
					vi.mocked(link).mockRejectedValueOnce(
						Object.assign(new Error('unavailable'), { code: 'EPERM' })
					);
			});
			expect(await readFile(filename, 'utf8')).toBe('verified');
			expect((await stat(filename)).ino).not.toBe(previous.ino);
			if (mode === 'changed permissions') expect((await stat(filename)).mode & 0o777).toBe(0o600);
			expect(await readdir(path.join(root, '.exact'))).toEqual([]);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	}
);

it('retains unchanged file identity when publishing a verified replacement tree', async () => {
	const root = await mkdtemp(path.join(tmpdir(), 'exact-library-identity-'));
	try {
		await mkdir(path.join(root, 'dist'));
		await writeFile(path.join(root, 'dist/stable.js'), 'unchanged');
		await writeFile(path.join(root, 'dist/changed.js'), 'previous');
		await writeFile(path.join(root, 'dist/removed.js'), 'obsolete');
		await writeFile(path.join(root, 'dist/publication.json'), '{}');
		const previous = await stat(path.join(root, 'dist/stable.js'));
		const publication = await stat(path.join(root, 'dist/publication.json'));
		await withLibraryOutput(
			root,
			false,
			async (output) => {
				await writeFile(path.join(output, 'stable.js'), 'unchanged');
				await writeFile(path.join(output, 'changed.js'), 'next');
				await writeFile(path.join(output, 'added.js'), 'new');
				await writeFile(path.join(output, 'publication.json'), '{}');
			},
			['publication.json']
		);
		const current = await stat(path.join(root, 'dist/stable.js'));
		expect(current.ino).toBe(previous.ino);
		expect(current.mtimeMs).toBe(previous.mtimeMs);
		expect((await stat(path.join(root, 'dist/publication.json'))).ino).not.toBe(publication.ino);
		expect(await readFile(path.join(root, 'dist/changed.js'), 'utf8')).toBe('next');
		expect(await readFile(path.join(root, 'dist/added.js'), 'utf8')).toBe('new');
		expect(await readdir(path.join(root, 'dist'))).not.toContain('removed.js');
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

it('keeps the previous generation readable until verified output is published', async () => {
	const root = await mkdtemp(path.join(tmpdir(), 'exact-library-publication-'));
	try {
		await mkdir(path.join(root, 'dist'));
		await writeFile(path.join(root, 'dist/value'), 'previous');
		await withLibraryOutput(root, false, async (output) => {
			await writeFile(path.join(output, 'value'), 'next');
			expect(await readFile(path.join(root, 'dist/value'), 'utf8')).toBe('previous');
		});
		expect(await readFile(path.join(root, 'dist/value'), 'utf8')).toBe('next');
		await expect(
			withLibraryOutput(root, false, async (output) => {
				await writeFile(path.join(output, 'value'), 'incomplete');
				throw new Error('failed compilation');
			})
		).rejects.toThrow('failed compilation');
		expect(await readFile(path.join(root, 'dist/value'), 'utf8')).toBe('next');
		expect(await readdir(path.join(root, '.exact'))).toEqual([]);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

it('retains the previous generation when publication and rollback both fail', async () => {
	const root = await mkdtemp(path.join(tmpdir(), 'exact-library-recovery-'));
	try {
		await mkdir(path.join(root, 'dist'));
		await writeFile(path.join(root, 'dist/previous'), 'recoverable');
		await expect(
			withLibraryOutput(root, false, async () => {
				// Windows can refuse publication or restoration while output files are open.
				const original =
					await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
				vi.mocked(rename)
					.mockImplementationOnce(original.rename)
					.mockRejectedValueOnce(Object.assign(new Error('publication is busy'), { code: 'EPERM' }))
					.mockRejectedValueOnce(
						Object.assign(new Error('restoration is busy'), { code: 'EPERM' })
					);
			})
		).rejects.toThrow(/previous output remains at/);
		const cache = path.join(root, '.exact');
		const backup = (await readdir(cache)).find((name) => name.startsWith('library-build-'));
		expect(backup).toBeDefined();
		expect(await readFile(path.join(cache, backup!, 'previous/previous'), 'utf8')).toBe(
			'recoverable'
		);
		expect(await readdir(cache)).not.toContain('library-build.lock');
	} finally {
		vi.mocked(rename).mockRestore();
		await rm(root, { recursive: true, force: true });
	}
});
