import { execFileSync } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(import.meta.dirname, '..');
const workspaceGroups = [
	'agents',
	'packages',
	'framework-adapters',
	'react-adapters',
	'plugins',
	'component-libraries',
	'apps'
];

/** Creates an affected release plan. */
export async function createAffectedReleasePlan(base = process.env.RELEASE_BASE ?? 'HEAD^') {
	const workspaces = await readWorkspaces();
	const changedFiles = changedFilesSince(base);
	const globalChange = changedFiles.some(
		(filename) =>
			/^(?:package(?:-lock)?\.json|tsconfig(?:\.[^/]+)?\.json)$/.test(filename) ||
			filename.startsWith('.github/')
	);
	const directlyChanged = new Set();
	for (const filename of changedFiles) {
		const workspace = workspaces.find(
			(candidate) =>
				filename === candidate.directory || filename.startsWith(`${candidate.directory}/`)
		);
		if (workspace) directlyChanged.add(workspace.name);
	}
	const affected = globalChange
		? new Set(workspaces.map((workspace) => workspace.name))
		: reverseClosure(directlyChanged, workspaces);
	const selected = workspaces.filter((workspace) => affected.has(workspace.name));
	const changedScripts = changedFiles.filter((filename) => filename.startsWith('scripts/'));
	const reactCompatibility =
		selected.some((workspace) =>
			/react-(?:compat|compatibility|dom-compat)|react-reconciler-reference/.test(
				`${workspace.name} ${workspace.directory}`
			)
		) || changedScripts.some((filename) => /react|r3f/.test(filename));
	const r3fBrowser =
		selected.some((workspace) =>
			/react-(?:compat|dom-compat)|react-reconciler-reference/.test(
				`${workspace.name} ${workspace.directory}`
			)
		) || changedScripts.some((filename) => /r3f|react-reconciler/.test(filename));
	const compilerAcceptance = compilerAcceptanceAffected(changedFiles);

	return Object.freeze({
		base,
		changedFiles: Object.freeze(changedFiles),
		globalChange,
		workspaces: Object.freeze(selected),
		packageTestDirectories: Object.freeze(
			selected
				.filter((workspace) => workspace.group !== 'apps')
				.map((workspace) => workspace.directory)
		),
		apps: Object.freeze({
			kanban: selected.some((workspace) => workspace.directory === 'apps/kanban'),
			workbench: selected.some((workspace) => workspace.directory === 'apps/workbench'),
			serverComponents: selected.some(
				(workspace) => workspace.directory === 'apps/server-components'
			),
			shipping: selected.some((workspace) => workspace.directory === 'apps/shipping-calculator')
		}),
		reactCompatibility,
		r3fBrowser,
		compilerAcceptance,
		expressions:
			selected.some(
				(workspace) =>
					workspace.name === '@exactjs/expressions' || workspace.name === '@exactjs/compiler'
			) || changedScripts.some((filename) => filename.includes('expression'))
	});
}

/**
 * Reports whether changed source can alter compiler output or its bundler assembly.
 *
 * Runtime-only and application changes intentionally remain outside this slower browser gate.
 */
export function compilerAcceptanceAffected(changedFiles) {
	return changedFiles.some(
		(filename) =>
			filename.startsWith('native/typescript-go/') ||
			/^packages\/(?:compiler|expressions|plugin-api|plugin-host)\//.test(filename) ||
			/^framework-adapters\/(?:bun|vite|webpack)-plugin\//.test(filename) ||
			[
				'scripts/check-compiler-acceptance.mjs',
				'scripts/start-vite-acceptance-server.mjs',
				'scripts/release-affected.mjs'
			].includes(filename)
	);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
	const base = process.argv.find((value) => value.startsWith('--base='))?.slice('--base='.length);
	console.log(JSON.stringify(await createAffectedReleasePlan(base), null, 2));
}

async function readWorkspaces() {
	const workspaces = [];
	for (const group of workspaceGroups) {
		for (const entry of await readdir(path.join(root, group), { withFileTypes: true })) {
			if (!entry.isDirectory()) continue;
			const directory = `${group}/${entry.name}`;
			try {
				const manifest = JSON.parse(
					await readFile(path.join(root, directory, 'package.json'), 'utf8')
				);
				workspaces.push({
					name: manifest.name,
					directory,
					group,
					dependencies: Object.keys({
						...manifest.dependencies,
						...manifest.devDependencies,
						...manifest.peerDependencies,
						...manifest.optionalDependencies
					})
				});
			} catch (error) {
				if (error?.code === 'ENOENT') continue;
				throw new Error(`Unable to read workspace manifest ${directory}/package.json`, {
					cause: error
				});
			}
		}
	}
	return workspaces.sort((left, right) => right.directory.length - left.directory.length);
}

function changedFilesSince(base) {
	const sets = [
		git(['diff', '--name-only', `${base}...HEAD`, '--']),
		git(['diff', '--name-only', '--']),
		git(['diff', '--cached', '--name-only', '--']),
		git(['ls-files', '--others', '--exclude-standard'])
	];
	return [
		...new Set(
			sets
				.flat()
				.map((filename) => filename.replaceAll('\\', '/'))
				.filter(Boolean)
		)
	].sort();
}

function git(args) {
	try {
		return execFileSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true }).split(
			/\r?\n/
		);
	} catch {
		return [];
	}
}

function reverseClosure(initial, workspaces) {
	const affected = new Set(initial);
	let changed = true;
	while (changed) {
		changed = false;
		for (const workspace of workspaces) {
			if (affected.has(workspace.name)) continue;
			if (workspace.dependencies.some((dependency) => affected.has(dependency))) {
				affected.add(workspace.name);
				changed = true;
			}
		}
	}
	return affected;
}
