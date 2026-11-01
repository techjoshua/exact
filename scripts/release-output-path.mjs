import { lstat, realpath } from 'node:fs/promises';
import path from 'node:path';

/**
 * Checks a disposable release directory before recursive replacement. Rejects paths outside
 * .tmp and symlink or junction ancestors, including .tmp itself. Protected native input
 * directories must remain outside the physical output directory. The workspace must not be
 * concurrently modified while packaging runs; this is not a race-proof filesystem sandbox.
 */
export async function assertReleaseOutput(root, output, nativeInputs = []) {
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
	if (nativeInputs.length > 0) {
		const physicalOutput = path.join(
			await realpath(root),
			path.relative(path.resolve(root), path.resolve(output))
		);
		for (const input of nativeInputs) {
			const relativeInput = path.relative(physicalOutput, await realpath(input));
			if (
				relativeInput !== '..' &&
				!relativeInput.startsWith(`..${path.sep}`) &&
				!path.isAbsolute(relativeInput)
			)
				throw new Error('Native input archives must be outside the release output directory.');
		}
	}
}
