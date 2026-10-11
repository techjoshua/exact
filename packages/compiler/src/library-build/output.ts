import { cp, lstat, mkdir, mkdtemp, readdir, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { retainUnchangedLibraryFiles } from './unchanged-files.js';

/** Rejects directory links before builds can overwrite files outside their owned output. */
async function rejectLinks(directory: string): Promise<void> {
	let info;
	try {
		info = await lstat(directory);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
		throw error;
	}
	if (info.isSymbolicLink())
		throw new Error(`Library output must not contain symbolic links: ${directory}`);
	if (info.isDirectory())
		for (const entry of await readdir(directory)) await rejectLinks(path.join(directory, entry));
}

/**
 * Publishes a verified replacement tree and restores the previous generation on publication failure.
 * Identical files retain identity where supported. Named publication markers always use new files.
 */
export async function withLibraryOutput(
	root: string,
	preserve: boolean,
	build: (stagedOutput: string) => Promise<void>,
	publicationMarkers: readonly string[] = []
): Promise<void> {
	const output = path.join(root, 'dist');
	const cache = path.join(root, '.exact');
	// Only the cache directory is build-owned here. Unrelated cached links are never
	// traversed or removed. A linked cache itself would redirect our staging writes.
	const cacheInfo = await lstat(cache).catch((error) => {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
		throw error;
	});
	if (cacheInfo?.isSymbolicLink())
		throw new Error(`Library cache must not be a symbolic link: ${cache}`);
	await mkdir(cache, { recursive: true });
	const lock = path.join(cache, 'library-build.lock');
	await mkdir(lock).catch((error) => {
		if ((error as NodeJS.ErrnoException).code === 'EEXIST')
			throw new Error(
				`A library build already owns ${root}; remove ${lock} only after confirming its process has stopped`
			);
		throw error;
	});
	let stage: string | undefined;
	let saved = false;
	let owned = false;
	try {
		await rejectLinks(output);
		stage = await mkdtemp(path.join(cache, 'library-build-'));
		const next = path.join(stage, 'next');
		if (preserve) {
			try {
				await cp(output, next, { recursive: true });
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
			}
		}
		await mkdir(next, { recursive: true });
		await build(next);
		await rejectLinks(next);
		await retainUnchangedLibraryFiles(
			output,
			next,
			path.join(stage, 'unchanged'),
			publicationMarkers
		);
		// Only verified output reaches dist. The prior generation remains readable during compilation.
		try {
			await rename(output, path.join(stage, 'previous'));
			saved = true;
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
		}
		owned = true;
		await rename(next, output);
	} catch (error) {
		if (owned) {
			const previous = saved ? path.join(stage!, 'previous') : undefined;
			try {
				await rm(output, { recursive: true, force: true });
				if (previous) await rename(previous, output);
			} catch (restoreError) {
				// Both removal and rename can fail, especially when files are open on Windows.
				// Never discard the only recoverable generation when rollback cannot finish.
				if (previous) stage = undefined;
				throw new AggregateError(
					[error, restoreError],
					previous
						? `Library build failed; previous output remains at ${previous}`
						: `Library build failed; incomplete output remains at ${output}`
				);
			}
		}
		throw error;
	} finally {
		try {
			if (stage) await rm(stage, { recursive: true, force: true });
		} finally {
			await rm(lock, { recursive: true, force: true });
		}
	}
}
