import { link, lstat, mkdir, readFile, readdir, rename, rm } from 'node:fs/promises';
import path from 'node:path';

/**
 * Reuses identical regular files inside a private replacement tree under its publication lock.
 * Hard links preserve watch identity without changing whole-tree publication or rollback.
 * Publication markers retain fresh files so observers can detect each completed generation.
 * Filesystems that cannot create links retain the independently verified replacement files.
 */
export async function retainUnchangedLibraryFiles(
	previous: string,
	next: string,
	workspace: string,
	publicationMarkers: readonly string[]
): Promise<void> {
	await mkdir(workspace);
	let sequence = 0;
	const visit = async (relative: string): Promise<void> => {
		if (publicationMarkers.includes(relative)) return;
		const staged = path.join(next, relative);
		const stagedInfo = await lstat(staged);
		if (stagedInfo.isDirectory()) {
			for (const entry of await readdir(staged)) await visit(path.join(relative, entry));
			return;
		}
		if (!stagedInfo.isFile()) return;
		const published = path.join(previous, relative);
		const publishedInfo = await lstat(published).catch((error: NodeJS.ErrnoException) => {
			if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return undefined;
			throw error;
		});
		if (
			!publishedInfo?.isFile() ||
			publishedInfo.mode !== stagedInfo.mode ||
			publishedInfo.size !== stagedInfo.size
		)
			return;
		const [before, after] = await Promise.all([readFile(published), readFile(staged)]);
		if (!before.equals(after)) return;
		const retained = path.join(workspace, String(sequence++));
		try {
			await link(published, retained);
			await rename(retained, staged);
		} catch (error) {
			if (
				!['EXDEV', 'EPERM', 'EACCES', 'ENOTSUP', 'EOPNOTSUPP', 'ENOSYS'].includes(
					(error as NodeJS.ErrnoException).code ?? ''
				)
			)
				throw error;
		}
	};
	try {
		await visit('');
	} finally {
		await rm(workspace, { recursive: true, force: true });
	}
}
