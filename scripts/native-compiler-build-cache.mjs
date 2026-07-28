import { createHash } from 'node:crypto';
import { access, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Computes a stable key for the repository-owned inputs to one native compiler binary.
 *
 * The pinned upstream revision represents the unmodified TypeScript-Go tree. The
 * repository overlay and build host are hashed by content so branch switches and
 * timestamp-preserving checkouts cannot reuse an incompatible executable.
 */
export async function createNativeCompilerBuildKey({ repositoryRoot, revision, target }) {
	const hash = createHash('sha256');
	hash.update(`revision\0${revision}\0target\0${target}\0`);
	const inputs = [
		path.join(repositoryRoot, 'native', 'typescript-go', 'upstream.json'),
		path.join(repositoryRoot, 'native', 'typescript-go', 'overlay'),
		path.join(repositoryRoot, 'scripts', 'build-native-compiler.mjs'),
		path.join(repositoryRoot, 'scripts', 'native-compiler-build-cache.mjs'),
		path.join(repositoryRoot, 'scripts', 'native-compiler-source.mjs')
	];
	for (const filename of await listFiles(inputs)) {
		hash.update(path.relative(repositoryRoot, filename).replaceAll('\\', '/'));
		hash.update('\0');
		hash.update(await readFile(filename));
		hash.update('\0');
	}
	return hash.digest('hex');
}

/**
 * Reports whether an executable and its successful-build stamp match the expected inputs.
 *
 * Forced and package builds deliberately bypass reuse because release packaging
 * also stages licenses and target-specific package contents.
 */
export async function isNativeCompilerBuildCurrent({
	executable,
	stampFile,
	buildKey,
	bypassCache = false
}) {
	if (bypassCache || !(await pathExists(executable))) return false;
	try {
		const stamp = JSON.parse(await readFile(stampFile, 'utf8'));
		return (
			stamp.version === 1 &&
			stamp.buildKey === buildKey &&
			stamp.executableHash === (await fileHash(executable))
		);
	} catch (error) {
		if (error?.code === 'ENOENT' || error instanceof SyntaxError) return false;
		throw error;
	}
}

/** Records a successfully produced native compiler executable for later local builds. */
export async function writeNativeCompilerBuildStamp(stampFile, buildKey, executable) {
	const executableHash = await fileHash(executable);
	await writeFile(
		stampFile,
		`${JSON.stringify({ version: 1, buildKey, executableHash }, null, 2)}\n`
	);
}

async function listFiles(inputs) {
	const files = [];
	for (const input of inputs) {
		const entries = await readdir(input, { withFileTypes: true }).catch((error) => {
			if (error?.code === 'ENOTDIR') return undefined;
			throw error;
		});
		if (!entries) {
			files.push(input);
			continue;
		}
		for (const entry of entries) {
			const child = path.join(input, entry.name);
			if (entry.isDirectory()) files.push(...(await listFiles([child])));
			else if (entry.isFile()) files.push(child);
		}
	}
	return files.sort();
}

async function pathExists(filename) {
	try {
		await access(filename);
		return true;
	} catch (error) {
		if (error?.code === 'ENOENT') return false;
		throw error;
	}
}

async function fileHash(filename) {
	return createHash('sha256')
		.update(await readFile(filename))
		.digest('hex');
}
