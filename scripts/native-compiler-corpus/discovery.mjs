import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';

import { isNativeCompilerCorpusProject, isNativeCompilerCorpusSource } from './measurement.mjs';

/**
 * Discovers the stable source and project set shared by compatibility and
 * all-Go compiler corpus measurements.
 */
export async function discoverNativeCompilerCorpus(root) {
	const files = await collectSources(root);
	const groups = new Map();
	const projectEligibility = new Map();
	for (const filename of files) {
		const config = nearestFile(root, path.dirname(filename), 'tsconfig.json');
		if (!config) throw new Error(`No tsconfig.json found for ${filename}`);
		let eligible = projectEligibility.get(config);
		if (eligible === undefined) {
			eligible = await nativeCompilerCorpusProject(root, config);
			projectEligibility.set(config, eligible);
		}
		if (!eligible) continue;
		const group = groups.get(config) ?? [];
		group.push(filename);
		groups.set(config, group);
	}
	return {
		files: [...groups.values()].flat(),
		groups
	};
}

async function collectSources(directory) {
	const output = [];
	for (const entry of await readdir(directory, { withFileTypes: true })) {
		if (entry.isDirectory() && isExcludedNativeCompilerCorpusDirectory(entry.name)) continue;
		const filename = path.join(directory, entry.name);
		if (entry.isDirectory()) output.push(...(await collectSources(filename)));
		else if (isNativeCompilerCorpusSource(entry.name)) output.push(filename);
	}
	return output;
}

/** Identifies dependency, generated-output, and compiler-work directories outside the source corpus. */
export function isExcludedNativeCompilerCorpusDirectory(name) {
	return (
		name === 'node_modules' ||
		name === 'dist' ||
		name.startsWith('dist-') ||
		name === '.build' ||
		name === '.exact' ||
		name === '.git' ||
		name === '.tmp'
	);
}

async function nativeCompilerCorpusProject(root, config) {
	const read = ts.readConfigFile(config, ts.sys.readFile);
	if (read.error) return false;
	const parsed = ts.parseJsonConfigFileContent(
		read.config,
		ts.sys,
		path.dirname(config),
		undefined,
		config
	);
	const manifest = nearestFile(root, path.dirname(config), 'package.json');
	return isNativeCompilerCorpusProject(
		manifest ? JSON.parse(await readFile(manifest, 'utf8')) : undefined,
		parsed.options.jsxImportSource
	);
}

function nearestFile(root, directory, basename) {
	let cursor = directory;
	while (cursor.startsWith(root)) {
		const candidate = path.join(cursor, basename);
		if (existsSync(candidate)) return candidate;
		const parent = path.dirname(cursor);
		if (parent === cursor) break;
		cursor = parent;
	}
	return undefined;
}
