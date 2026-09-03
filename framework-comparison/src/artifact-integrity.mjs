import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import { relative, resolve } from 'node:path';

/** Hashes a production artifact as an ordered relative-path/content stream. */
export async function hashArtifactDirectory(directory) {
	const root = resolve(directory);
	const files = await allFiles(root);
	const hash = createHash('sha256');
	for (const path of files) {
		hash.update(relative(root, path).replaceAll('\\', '/'));
		hash.update('\0');
		hash.update(await readFile(path));
		hash.update('\0');
	}
	return hash.digest('hex');
}

/** Hashes one participant-neutral semantic response captured after correctness settles. */
export function hashSemanticResponse(value) {
	return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

/**
 * Hashes complete SSR bytes after removing only TanStack Router's request-time match timestamps.
 * The timestamps govern client staleness but do not describe application output; response length and
 * every other byte remain independently checked by the SSR harness.
 */
export function hashStableSsrResponse(bytes) {
	const source = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
	if (!source.includes(Buffer.from('name="framework-participant" content="tanstack-start"')))
		return createHash('sha256').update(source).digest('hex');
	const normalized = source.toString('utf8').replace(/\bu:\d+(?=,s:)/gu, 'u:<request-time>');
	return createHash('sha256').update(normalized).digest('hex');
}

async function allFiles(directory) {
	const result = [];
	for (const entry of await readdir(directory, { withFileTypes: true })) {
		const path = resolve(directory, entry.name);
		if (entry.isDirectory()) result.push(...(await allFiles(path)));
		else if ((await stat(path)).isFile()) result.push(path);
	}
	return result.sort();
}
