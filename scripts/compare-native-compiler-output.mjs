import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { loadExactPackageEnhancements } from '../packages/config/dist/node.js';
import { preparePackageEnhancementSource } from '../packages/compiler/dist/compilation/package-enhancements.js';

import { discoverNativeCompilerCorpus } from './native-compiler-corpus/discovery.mjs';

/** Removes response fields that describe execution rather than compiler output. */
export function normalizeNativeCompilerResponse(response) {
	const { timings: _timings, cacheHit: _cacheHit, ...output } = response;
	return output;
}

/** Returns the first structural difference between two JSON-compatible values. */
export function firstNativeCompilerDifference(before, after, location = '$') {
	if (Object.is(before, after)) return undefined;
	if (typeof before !== typeof after || before === null || after === null)
		return { location, before, after };
	if (Array.isArray(before) || Array.isArray(after)) {
		if (!Array.isArray(before) || !Array.isArray(after)) return { location, before, after };
		if (before.length !== after.length)
			return {
				location: `${location}.length`,
				before: before.length,
				after: after.length
			};
		for (let index = 0; index < before.length; index++) {
			const difference = firstNativeCompilerDifference(
				before[index],
				after[index],
				`${location}[${index}]`
			);
			if (difference) return difference;
		}
		return undefined;
	}
	if (typeof before !== 'object') return { location, before, after };
	const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
	for (const key of keys) {
		if (!Object.hasOwn(before, key) || !Object.hasOwn(after, key))
			return { location: `${location}.${key}`, before: before[key], after: after[key] };
		const difference = firstNativeCompilerDifference(before[key], after[key], `${location}.${key}`);
		if (difference) return difference;
	}
	return undefined;
}

async function main() {
	const root = path.resolve(import.meta.dirname, '..');
	const beforeExecutable = requiredArgument('before');
	const afterExecutable = requiredArgument('after');
	const discovered = await discoverNativeCompilerCorpus(root);
	const projectFilter = process.env.EXACT_NATIVE_CORPUS_PROJECT;
	const groups = [...discovered.groups]
		.filter(([config]) =>
			projectFilter
				? path.relative(root, config).replaceAll('\\', '/').includes(projectFilter)
				: true
		)
		.map(([config, filenames]) => ({
			config,
			filenames,
			packageEnhancements: loadExactPackageEnhancements({
				applicationRoot: path.dirname(config)
			}).packageEnhancements
		}));
	if (groups.length === 0)
		throw new Error(
			`EXACT_NATIVE_CORPUS_PROJECT matched no projects: ${JSON.stringify(projectFilter)}`
		);
	const requests = [];
	const evidence = new Map();
	for (const group of groups) {
		for (const filename of group.filenames) {
			const authoredSource = await readFile(filename, 'utf8');
			const prepared = preparePackageEnhancementSource(
				authoredSource,
				filename,
				group.packageEnhancements
			);
			const id = filename;
			requests.push({
				id,
				kind: 'compile',
				source: prepared.source,
				configFile: group.config,
				diagnostics: 'syntax',
				sourceMap: true,
				packageEnhancementBoundary:
					prepared.moduleSpecifiers.size === 0 ? 0 : prepared.authoredLength
			});
			evidence.set(id, { config: group.config, filename, target: 'default' });
		}
	}
	const [beforeResponses, afterResponses] = await Promise.all([
		runNativeCompiler(beforeExecutable, requests, root),
		runNativeCompiler(afterExecutable, requests, root)
	]);
	if (beforeResponses.length !== afterResponses.length)
		throw new Error(
			`Native compilers returned different response counts: ${beforeResponses.length} and ${afterResponses.length}`
		);
	for (let index = 0; index < beforeResponses.length; index++) {
		const before = normalizeNativeCompilerResponse(beforeResponses[index]);
		const after = normalizeNativeCompilerResponse(afterResponses[index]);
		if (isDeepStrictEqual(before, after)) continue;
		const context = evidence.get(String(before.id ?? after.id)) ?? {};
		const difference = firstNativeCompilerDifference(before, after);
		throw new Error(
			[
				'Native compiler output changed.',
				`Project: ${context.config ?? '<unknown>'}`,
				`Source: ${context.filename ?? '<unknown>'}`,
				`Target: ${context.target ?? '<unknown>'}`,
				`Code equal: ${before.code === after.code}`,
				`Source map equal: ${isDeepStrictEqual(before.sourceMap, after.sourceMap)}`,
				`Path: ${difference?.location ?? '$'}`,
				`Before: ${JSON.stringify(difference?.before)}`,
				`After: ${JSON.stringify(difference?.after)}`
			].join('\n')
		);
	}
	console.log(
		`Native compiler outputs match for ${requests.length} files across ${groups.length} projects.`
	);
}

function requiredArgument(name) {
	const separate = process.argv.indexOf(`--${name}`);
	const value =
		separate === -1
			? process.argv.find((argument) => argument.startsWith(`--${name}=`))?.slice(name.length + 3)
			: process.argv[separate + 1];
	if (!value) throw new Error(`Missing required --${name} executable`);
	return path.resolve(value);
}

function runNativeCompiler(executable, requests, cwd) {
	return new Promise((resolve, reject) => {
		const child = spawn(executable, [], {
			cwd,
			stdio: ['pipe', 'pipe', 'pipe'],
			windowsHide: true
		});
		let stdout = '';
		let stderr = '';
		let stdinError;
		child.stdout.setEncoding('utf8');
		child.stderr.setEncoding('utf8');
		child.stdout.on('data', (chunk) => (stdout += chunk));
		child.stderr.on('data', (chunk) => (stderr += chunk));
		child.stdin.once('error', (error) => (stdinError = error));
		child.once('error', reject);
		child.once('exit', (code) => {
			if (code !== 0 || stdinError) {
				reject(
					new Error(
						`Native compiler ${executable} exited ${code}${stdinError ? ` (${stdinError.message})` : ''}${stderr ? `\n${stderr}` : ''}`
					)
				);
				return;
			}
			try {
				resolve(
					stdout
						.split(/\r?\n/u)
						.filter(Boolean)
						.map((line) => JSON.parse(line))
				);
			} catch (error) {
				reject(new Error(`Native compiler ${executable} returned invalid JSON`, { cause: error }));
			}
		});
		for (const request of requests) child.stdin.write(`${JSON.stringify(request)}\n`);
		child.stdin.end(`${JSON.stringify({ kind: 'shutdown' })}\n`);
	});
}

if (pathToFileURL(process.argv[1]).href === import.meta.url) await main();
