import { cp, lstat, mkdir, mkdtemp, readdir, rename, rm } from 'node:fs/promises';
import path from 'node:path';

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

/** Owns dist exclusively for one build, restoring its previous contents on any build failure. */
export async function withLibraryOutput(
	root: string,
	preserve: boolean,
	build: () => Promise<void>
): Promise<void> {
	const output = path.join(root, 'dist');
	const lock = path.join(root, '.exact-library-build.lock');
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
		stage = await mkdtemp(path.join(root, '.exact-library-build-'));
		try {
			await rename(output, path.join(stage, 'previous'));
			saved = true;
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
		}
		owned = true;
		if (preserve && saved) await cp(path.join(stage, 'previous'), output, { recursive: true });
		else await mkdir(output);
		await build();
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
