import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';

import { isExpressionCorpusProject, isExpressionCorpusSource } from './measurement.mjs';

/**
 * Discovers the stable source and project set shared by compatibility and
 * all-Go compiler corpus measurements.
 */
export async function discoverExpressionCorpus(root) {
	const files = await collectSources(root);
	const groups = new Map();
	const projectEligibility = new Map();
	for (const filename of files) {
		const config = nearestFile(root, path.dirname(filename), 'tsconfig.json');
		if (!config) throw new Error(`No tsconfig.json found for ${filename}`);
		let eligible = projectEligibility.get(config);
		if (eligible === undefined) {
			eligible = await expressionCorpusProject(root, config);
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
		if (
			entry.name === 'node_modules' ||
			entry.name === 'dist' ||
			entry.name === '.git' ||
			entry.name === '.tmp'
		)
			continue;
		const filename = path.join(directory, entry.name);
		if (entry.isDirectory()) output.push(...(await collectSources(filename)));
		else if (isExpressionCorpusSource(entry.name)) output.push(filename);
	}
	return output;
}

async function expressionCorpusProject(root, config) {
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
	return isExpressionCorpusProject(
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
