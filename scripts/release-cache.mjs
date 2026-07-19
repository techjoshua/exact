import { createHash } from 'node:crypto';
import { copyFile, mkdir, readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const cacheRoot = path.join(root, '.tmp', 'release-cache');

export async function releaseCacheKey(inputs, salt = '') {
	const hash = createHash('sha256');
	hash.update(
		`release-cache-v1\0${salt}\0${process.platform}\0${process.arch}\0${process.version}\0`
	);
	const files = [];
	for (const input of inputs) await collect(path.resolve(root, input), files);
	files.sort();
	for (const filename of files) {
		hash.update(`${path.relative(root, filename).replaceAll('\\', '/')}\0`);
		hash.update(await readFile(filename));
		hash.update('\0');
	}
	return hash.digest('hex').slice(0, 24);
}

export async function restoreCachedArtifact(namespace, key, destination) {
	const source = path.join(cacheRoot, namespace, key, path.basename(destination));
	try {
		await copyFile(source, destination);
		return true;
	} catch {
		return false;
	}
}

export async function storeCachedArtifact(namespace, key, source) {
	const directory = path.join(cacheRoot, namespace, key);
	await mkdir(directory, { recursive: true });
	await copyFile(source, path.join(directory, path.basename(source)));
}

async function collect(filename, files) {
	let details;
	try {
		details = await stat(filename);
	} catch {
		return;
	}
	if (details.isFile()) {
		files.push(filename);
		return;
	}
	if (!details.isDirectory()) return;
	for (const entry of await readdir(filename, { withFileTypes: true })) {
		if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === '.tmp') continue;
		await collect(path.join(filename, entry.name), files);
	}
}
