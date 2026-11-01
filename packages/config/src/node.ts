import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { readFile, realpath, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { prepareNativeConfigSource } from './native-config-preparation.js';
import type { ExactConfig } from './contracts.js';
import type { ExactPackageEnhancementImport } from './contracts.js';
import { normalizeExactConfig } from './normalization.js';

const configRequire = createRequire(import.meta.url);

const configNames = Object.freeze([
	'exact.config.ts',
	'exact.config.mts',
	'exact.config.js',
	'exact.config.mjs',
	'exact.config.cjs'
]);

/** Result of loading the application's one neutral eXact configuration object. */
export type ExactLoadedConfig = Readonly<{
	config?: ExactConfig;
	configPath?: string;
	watchFiles: readonly string[];
	/** Attributed imports made package-wide by the owning configuration module. */
	packageEnhancements: readonly ExactPackageEnhancementImport[];
}>;

/** Options for deterministic eXact configuration discovery and loading. */
export type LoadExactConfigOptions = Readonly<{
	applicationRoot: string;
	configPath?: string;
}>;

/** Reads only static package enhancement declarations without executing configuration code. */
export function loadExactPackageEnhancements(options: LoadExactConfigOptions): Readonly<{
	configPath?: string;
	packageEnhancements: readonly ExactPackageEnhancementImport[];
}> {
	const applicationRoot = path.resolve(options.applicationRoot);
	const configPath = options.configPath
		? path.resolve(applicationRoot, options.configPath)
		: findExactConfig(applicationRoot);
	if (!configPath) return { packageEnhancements: [] };
	if (!existsSync(configPath)) throw new Error(`eXact configuration not found: ${configPath}`);
	return {
		configPath,
		packageEnhancements: extractPackageEnhancements(readFileSync(configPath, 'utf8'), configPath)
			.packageEnhancements
	};
}

/**
 * Discovers and loads eXact configuration without preparing plugins or build adapters.
 * Temporary ESM modules are removed before the returned promise settles.
 */
export async function loadExactConfig(options: LoadExactConfigOptions): Promise<ExactLoadedConfig> {
	const applicationRoot = path.resolve(options.applicationRoot);
	const configPath = options.configPath
		? path.resolve(applicationRoot, options.configPath)
		: findExactConfig(applicationRoot);
	if (!configPath)
		return {
			watchFiles: [],
			packageEnhancements: []
		};
	if (!existsSync(configPath)) throw new Error(`eXact configuration not found: ${configPath}`);
	const loaded = await importExactConfig(configPath);
	return {
		config: loaded.config,
		configPath,
		watchFiles: [configPath],
		packageEnhancements: loaded.packageEnhancements
	};
}

/** Finds the nearest eXact config without escaping an optional owning-workspace boundary. */
export function findExactConfig(start: string, boundary?: string): string | undefined {
	return exactConfigSearchPaths(start, boundary).find((candidate) => existsSync(candidate));
}

/**
 * Lists config candidates in discovery order, including absent files that build watchers must
 * observe for later creation. Stops at the optional workspace boundary or filesystem root.
 */
export function exactConfigSearchPaths(start: string, boundary?: string): readonly string[] {
	let directory = path.resolve(start);
	const limit = boundary === undefined ? undefined : path.resolve(boundary);
	if (limit !== undefined && !pathContains(limit, directory)) return [];
	const candidates: string[] = [];
	while (true) {
		for (const name of configNames) candidates.push(path.join(directory, name));
		if (limit !== undefined && samePath(directory, limit)) return candidates;
		const parent = path.dirname(directory);
		if (parent === directory) return candidates;
		directory = parent;
	}
}

function pathContains(parent: string, candidate: string): boolean {
	const relative = path.relative(parent, candidate);
	return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function samePath(left: string, right: string): boolean {
	return process.platform === 'win32' ? left.toLowerCase() === right.toLowerCase() : left === right;
}

async function importExactConfig(configPath: string): Promise<
	Readonly<{
		config: ExactConfig;
		packageEnhancements: readonly ExactPackageEnhancementImport[];
	}>
> {
	let imported: Record<string, unknown>;
	const authored = await readFile(configPath, 'utf8');
	const declaration = await prepareNativeConfigSource(authored, configPath);
	if (/\.[cm]?ts$/i.test(configPath)) {
		imported = await importFreshEsm(configPath, declaration.executableSource);
	} else if (declaration.packageEnhancements.length) {
		if (/\.cjs$/i.test(configPath))
			throw new Error('Package-scoped enhancement exports require an ESM exact configuration');
		imported = await importFreshEsm(configPath, declaration.executableSource);
	} else if (process.versions.bun && /\.m?js$/i.test(configPath)) {
		// Bun shares ESM and require.cache entries and ignores import query cache-busters.
		// Evict only this application's config, retaining dependency and unrelated module state.
		const filename = await realpath(configPath);
		delete configRequire.cache[filename];
		imported = await nativeImport(pathToFileURL(filename).href);
	} else {
		// Ordinary Node ESM must remain loadable without write access to its directory.
		imported = await nativeImport(
			`${pathToFileURL(configPath).href}?t=${statSync(configPath).mtimeMs}`
		);
	}
	const config = imported.default;
	if (!config || typeof config !== 'object' || Array.isArray(config))
		throw new Error(`${configPath} must default-export an eXact configuration object`);
	return {
		config: normalizeExactConfig(config as ExactConfig, configPath),
		packageEnhancements: declaration.packageEnhancements
	};
}

/**
 * Owns one preprocessed ESM evaluation with a distinct temporary module identity.
 * Keeping the file beside the authored module preserves native import and resolve behavior.
 * The native import.meta object retains authored paths, including in returned callbacks.
 */
async function importFreshEsm(
	configPath: string,
	source: string
): Promise<Record<string, unknown>> {
	const filename = await realpath(configPath);
	const directory = path.dirname(filename);
	const temporary = path.join(directory, `.exact-config-${process.pid}-${randomUUID()}.mjs`);
	const metadata = [
		`import.meta.url = ${JSON.stringify(pathToFileURL(filename).href)};`,
		...Object.entries({
			filename,
			dirname: directory,
			path: filename,
			file: path.basename(filename),
			dir: directory
		}).map(
			([key, value]) =>
				`if (${JSON.stringify(key)} in import.meta) import.meta.${key} = ${JSON.stringify(value)};`
		)
	].join(' ');
	// Preserve an authored hashbang as the first line of the temporary module.
	const hashbangEnd = source.startsWith('#!') ? source.indexOf('\n') : -1;
	const executable =
		hashbangEnd < 0
			? `${metadata}\n${source}`
			: `${source.slice(0, hashbangEnd + 1)}${metadata}\n${source.slice(hashbangEnd + 1)}`;
	try {
		await writeFile(temporary, executable, { flag: 'wx' });
		return await nativeImport(pathToFileURL(temporary).href);
	} finally {
		await rm(temporary, { force: true });
	}
}

/**
 * Preserves the synchronous declaration API with one same-runtime preparation command.
 * Only plain registration data crosses this boundary. The canonical async helper owns
 * parsing and cleanup, and is never asked to evaluate config code or emit TypeScript.
 */
function extractPackageEnhancements(
	source: string,
	configPath: string
): Readonly<{ packageEnhancements: readonly ExactPackageEnhancementImport[] }> {
	const built = new URL('./native-config-command.js', import.meta.url);
	const entry = existsSync(fileURLToPath(built))
		? built
		: new URL('./native-config-command.ts', import.meta.url);
	const child = spawnSync(process.execPath, [fileURLToPath(entry)], {
		input: JSON.stringify({ source, configPath }),
		encoding: 'utf8',
		maxBuffer: 16 * 1024 * 1024,
		stdio: ['pipe', 'pipe', 'pipe']
	});
	if (child.error) throw child.error;
	if (child.status !== 0)
		throw new Error(
			`Unable to prepare ${configPath}: ${child.stderr.trim() || child.signal || `exit ${child.status}`}`
		);
	const response: unknown = JSON.parse(child.stdout);
	if (!response || typeof response !== 'object' || !('ok' in response))
		throw new Error('Invalid native config preparation response');
	if (
		response.ok === false &&
		'error' in response &&
		response.error &&
		typeof response.error === 'object' &&
		'name' in response.error &&
		typeof response.error.name === 'string' &&
		'message' in response.error &&
		typeof response.error.message === 'string'
	) {
		const error = new Error(response.error.message);
		error.name = response.error.name;
		throw error;
	}
	if (
		response.ok !== true ||
		!('packageEnhancements' in response) ||
		!Array.isArray(response.packageEnhancements)
	)
		throw new Error('Invalid native config preparation response');
	const packageEnhancements: unknown[] = response.packageEnhancements;
	if (
		!packageEnhancements.every(
			(value): value is ExactPackageEnhancementImport =>
				!!value &&
				typeof value === 'object' &&
				'localName' in value &&
				typeof value.localName === 'string' &&
				'moduleSpecifier' in value &&
				typeof value.moduleSpecifier === 'string' &&
				'importKind' in value &&
				value.importKind === 'namespace' &&
				'declaredIn' in value &&
				value.declaredIn === configPath
		)
	)
		throw new Error('Invalid native config declaration response');
	return { packageEnhancements };
}

async function nativeImport(specifier: string): Promise<Record<string, unknown>> {
	return import(
		/* @vite-ignore */
		/* webpackIgnore: true */
		specifier
	) as Promise<Record<string, unknown>>;
}
