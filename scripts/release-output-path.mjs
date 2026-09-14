import { lstat } from 'node:fs/promises';
import path from 'node:path';

/**
 * Checks a disposable release directory before recursive replacement. Rejects paths outside
 * .tmp and symlink or junction ancestors, including .tmp itself. The workspace must not be
 * concurrently modified while packaging runs; this is not a race-proof filesystem sandbox.
 */
export async function assertReleaseOutput(root, output) {
	const temporary = path.resolve(root, '.tmp');
	const relative = path.relative(temporary, path.resolve(output));
	if (
		!relative ||
		relative === '..' ||
		relative.startsWith(`..${path.sep}`) ||
		path.isAbsolute(relative)
	)
		throw new Error('Release output must be a subdirectory of the repository .tmp directory.');
	let current = temporary;
	for (const segment of ['', ...relative.split(path.sep)]) {
		current = path.join(current, segment);
		let status;
		try {
			status = await lstat(current);
		} catch (error) {
			if (error.code === 'ENOENT') continue;
			throw error;
		}
		if (status.isSymbolicLink() || !status.isDirectory())
			throw new Error(`Release output must not traverse links or non-directories: ${current}`);
	}
}
