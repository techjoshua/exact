import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';
import { recursiveDependencies } from './source-recursion.mjs';

/** Reads runtime dependencies while keeping erased type-only imports out of the execution graph. */
export function runtimeImports(filename, text) {
	const source = ts.createSourceFile(filename, text, ts.ScriptTarget.Latest, true);
	const imports = [];
	for (const node of source.statements) {
		if (!ts.isImportDeclaration(node) && !ts.isExportDeclaration(node)) continue;
		if (node.isTypeOnly || node.importClause?.isTypeOnly) continue;
		const bindings = node.importClause?.namedBindings ?? node.exportClause;
		if (
			bindings?.elements?.length &&
			bindings.elements.every((element) => element.isTypeOnly) &&
			!node.importClause?.name
		)
			continue;
		if (node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier))
			imports.push(node.moduleSpecifier.text);
	}
	return imports;
}

/** Builds the source-local runtime graph and validates benchmark imports against framework ownership. */
export function sourceDependencyGraph(sources) {
	const graph = new Map();
	for (const [filename, text] of sources) {
		const edges = [];
		for (const specifier of runtimeImports(filename, text)) {
			if (
				filename.startsWith('framework-comparison/') &&
				(/^@exactjs\/[^/]+\/(?:src|dist|internal|runtime|framework)(?:\/|$)/.test(specifier) ||
					/(?:^|\/)(?:packages|framework-adapters)\/[^/]+\/(?:src|dist)(?:\/|$)/.test(specifier))
			)
				throw new Error(`${filename}: benchmark must use public framework APIs: ${specifier}`);
			if (!specifier.startsWith('.')) continue;
			const target = path.posix.normalize(path.posix.join(path.posix.dirname(filename), specifier));
			const resolved = [
				target,
				target.replace(/\.jsx?$/, '.ts'),
				target.replace(/\.jsx?$/, '.tsx'),
				target + '/index.ts'
			].find((candidate) => sources.has(candidate));
			if (resolved) edges.push(resolved);
		}
		graph.set(filename, edges);
	}
	return graph;
}

/** Finds strongly connected runtime groups without introducing callback dispatch into recursive renderers. */
export function dependencyCycles(graph) {
	let next = 0;
	const indices = new Map(),
		low = new Map(),
		stack = [],
		active = new Set(),
		groups = [];
	function visit(node) {
		indices.set(node, next);
		low.set(node, next++);
		stack.push(node);
		active.add(node);
		for (const target of graph.get(node) ?? []) {
			if (!indices.has(target)) {
				visit(target);
				low.set(node, Math.min(low.get(node), low.get(target)));
			} else if (active.has(target)) low.set(node, Math.min(low.get(node), indices.get(target)));
		}
		if (low.get(node) !== indices.get(node)) return;
		const members = [];
		let member;
		do {
			member = stack.pop();
			active.delete(member);
			members.push(member);
		} while (member !== node);
		if (members.length > 1 || (graph.get(node) ?? []).includes(node)) groups.push(members);
	}
	for (const node of graph.keys()) if (!indices.has(node)) visit(node);
	return groups;
}

/** Rejects every cyclic edge outside the explicitly reviewed recursive call relationships. */
export function validateDependencyCycles(graph, allowed = recursiveDependencies) {
	const approved = new Set(
		allowed.flatMap((group) => group.edges.map(([from, to]) => `${from}\0${to}`))
	);
	const violations = [];
	for (const group of dependencyCycles(graph)) {
		const members = new Set(group);
		for (const from of group)
			for (const to of graph.get(from) ?? []) {
				if (members.has(to) && !approved.has(`${from}\0${to}`)) violations.push(`${from} -> ${to}`);
			}
	}
	if (violations.length)
		throw new Error(`Unreviewed cyclic dependencies:\n${violations.join('\n')}`);
}

/** Checks tracked and new maintained sources without reading generated workspace outputs. */
export async function checkSourceDependencies(root) {
	const deleted = new Set(
		execFileSync('git', ['ls-files', '--deleted', '-z'], { cwd: root, encoding: 'utf8' }).split(
			'\0'
		)
	);
	const files = execFileSync(
		'git',
		['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
		{ cwd: root, encoding: 'utf8' }
	)
		.split('\0')
		.filter(
			(file) =>
				!deleted.has(file) &&
				/^(?:packages|framework-adapters|react-adapters|plugins|component-libraries|apps|framework-comparison)\//.test(
					file
				) &&
				/\.(?:[cm]?[jt]sx?)$/.test(file) &&
				!/(?:\.test\.|\.spec\.|\/test-support\/|\/fixtures\/|\/generated\/)/.test(file)
		);
	const sources = new Map(
		await Promise.all(
			files.map(async (file) => [file, await readFile(path.join(root, file), 'utf8')])
		)
	);
	validateDependencyCycles(sourceDependencyGraph(sources));
}
