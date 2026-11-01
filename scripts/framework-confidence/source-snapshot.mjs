import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

/** Fingerprints repository source, fixtures and configuration without relying on dirty-status filenames. */
export async function captureFrameworkSources(root) {
	const files = execFileSync(
		'git',
		['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
		{ cwd: root, encoding: 'utf8' }
	)
		.split('\0')
		.filter((filename) => /\.(?:[cm]?[jt]sx?|json)$/.test(filename))
		.sort();
	const hash = createHash('sha256');
	let count = 0;
	for (const filename of files) {
		let contents;
		try {
			contents = await readFile(path.join(root, filename));
		} catch (error) {
			if (error.code === 'ENOENT') continue;
			throw error;
		}
		hash
			.update(filename)
			.update('\0')
			.update(createHash('sha256').update(contents).digest('hex'))
			.update('\0');
		count++;
	}
	return { algorithm: 'sha256', files: count, digest: hash.digest('hex') };
}
