import assert from 'node:assert/strict';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { API as NativeAPI, TypeFlags as NativeTypeFlags } from '@typescript/native/unstable/sync';
import { createVirtualFileSystem } from '@typescript/native/unstable/fs';
import { isIdentifier } from '@typescript/native/unstable/ast';
import { createExpressionProject } from '../../packages/expressions/dist/index.js';

const root = normalizePath(path.resolve(import.meta.dirname, '..', '..'));
const projectDirectory = `${root}/.tmp/typescript7-native-checker`;
const configFile = `${projectDirectory}/tsconfig.json`;
const sourceFile = `${projectDirectory}/view.tsx`;
const selectedNames = new Set(['count', 'doubled', 'enabled', 'label', 'state']);

const initialSource = `
declare class Component<S> {
	state: S;
}

export function View(
	this: Component<{ count: number; label: string; enabled: boolean }>
) {
	const doubled = this.state.count * 2;
	return () => (
		<button title={this.state.label} disabled={!this.state.enabled}>
			{doubled}
		</button>
	);
}
`.trim();

const updatedSource = initialSource
	.replace('count: number', 'count: string')
	.replace('this.state.count * 2', 'this.state.count.toUpperCase()');

const virtualFileSystem = createVirtualFileSystem({
	[configFile]: JSON.stringify({
		compilerOptions: {
			jsx: 'preserve',
			noEmit: true,
			strict: true,
			target: 'esnext'
		},
		files: ['view.tsx']
	}),
	[sourceFile]: initialSource
});

const legacy = createExpressionProject({
	cwd: projectDirectory,
	forceModuleDetection: true
});
const native = new NativeAPI({
	collectTiming: true,
	cwd: root,
	fs: virtualFileSystem
});

try {
	const coldLegacyStarted = performance.now();
	const initialLegacyModule = legacy.updateModule(sourceFile, initialSource);
	const coldLegacyElapsedMs = performance.now() - coldLegacyStarted;
	const coldNativeStarted = performance.now();
	const initialSnapshot = native.updateSnapshot({ openProjects: [configFile] });
	const initialNativeProject = requiredNativeProject(initialSnapshot);
	const initialNativeSource = requiredNativeSource(initialNativeProject);
	const initialNativeFacts = nativeFacts(initialNativeProject, initialNativeSource);
	const coldNativeElapsedMs = performance.now() - coldNativeStarted;

	const initialLegacyFacts = legacyFacts(initialLegacyModule);
	assertFactsEqual('initial projection', initialLegacyFacts, initialNativeFacts);
	assert.equal(factTypes(initialNativeFacts, 'count'), 'number');
	assert.equal(factTypes(initialNativeFacts, 'doubled'), 'number');

	virtualFileSystem.writeFile?.(sourceFile, updatedSource);
	const warmLegacyStarted = performance.now();
	const updatedLegacyModule = legacy.updateModule(sourceFile, updatedSource);
	const warmLegacyElapsedMs = performance.now() - warmLegacyStarted;
	const warmNativeStarted = performance.now();
	const updatedSnapshot = native.updateSnapshot({
		fileChanges: { changed: [sourceFile] }
	});
	const updatedNativeProject = requiredNativeProject(updatedSnapshot);
	const updatedNativeSource = requiredNativeSource(updatedNativeProject);
	const updatedNativeFacts = nativeFacts(updatedNativeProject, updatedNativeSource);
	const warmNativeElapsedMs = performance.now() - warmNativeStarted;

	const updatedLegacyFacts = legacyFacts(updatedLegacyModule);
	assertFactsEqual('incremental projection', updatedLegacyFacts, updatedNativeFacts);
	assert.equal(factTypes(updatedNativeFacts, 'count'), 'string');
	assert.equal(factTypes(updatedNativeFacts, 'doubled'), 'string');

	initialSnapshot.dispose();
	updatedSnapshot.dispose();

	const timing = native.getTimingInfo();
	console.log('TypeScript 7 native checker proof of concept passed.');
	console.log(
		`cold projection: legacy full module ${coldLegacyElapsedMs.toFixed(1)}ms, native selected facts ${coldNativeElapsedMs.toFixed(1)}ms`
	);
	console.log(
		`incremental projection: legacy full module ${warmLegacyElapsedMs.toFixed(1)}ms, native selected facts ${warmNativeElapsedMs.toFixed(1)}ms`
	);
	console.log(
		[
			`native requests: ${timing.totals.requestCount}`,
			`server: ${timing.totals.serverTimeMs.toFixed(1)}ms`,
			`transport: ${timing.totals.transportOverheadMs.toFixed(1)}ms`,
			`sent: ${timing.totals.bytesSent} bytes`,
			`received: ${timing.totals.bytesReceived} bytes`,
			`materialized nodes: ${timing.totals.nodesMaterialized}`
		].join('; ')
	);
} finally {
	legacy.dispose();
	native.close();
}

/**
 * Projects the selected identifier facts through the existing TypeScript 6
 * expression model.
 */
function legacyFacts(module) {
	return new Map(
		module
			.walk()
			.references()
			.toArray()
			.filter(
				(reference) =>
					reference.node.kind === 'Identifier' &&
					reference.name !== undefined &&
					selectedNames.has(reference.name) &&
					reference.node.span !== undefined &&
					reference.type !== undefined
			)
			.map((reference) => [
				factKey(reference.node.span.start, reference.node.span.end, reference.name),
				reference.type.display
			])
	);
}

/**
 * Projects the same selected facts through TypeScript 7's native checker. Type
 * lookups are submitted as one batch so the proof exercises the intended
 * low-round-trip integration shape.
 */
function nativeFacts(project, source) {
	const identifiers = [];
	const visit = (node) => {
		if (isIdentifier(node) && selectedNames.has(node.text)) identifiers.push(node);
		node.forEachChild(visit);
	};
	visit(source);

	const types = project.checker.getTypeAtLocation(identifiers);
	return new Map(
		identifiers.flatMap((identifier, index) => {
			const type = types[index];
			if (!type || type.flags & NativeTypeFlags.Error) return [];
			return [
				[
					factKey(identifier.getStart(source), identifier.getEnd(), identifier.text),
					project.checker.typeToString(type, identifier)
				]
			];
		})
	);
}

/** Fails with a readable per-span comparison when the two checker projections diverge. */
function assertFactsEqual(label, expected, actual) {
	assert.deepEqual(
		[...actual].sort(([left], [right]) => left.localeCompare(right)),
		[...expected].sort(([left], [right]) => left.localeCompare(right)),
		`${label} differs between TypeScript 6 and TypeScript 7`
	);
}

/** Returns the one primitive type observed for every selected occurrence of a name. */
function factTypes(facts, name) {
	const types = new Set(
		[...facts].filter(([key]) => key.endsWith(`:${name}`)).map(([, type]) => type)
	);
	assert.equal(types.size, 1, `expected one projected type for ${name}`);
	return [...types][0];
}

/** Resolves the virtual configured project or fails at the integration boundary. */
function requiredNativeProject(snapshot) {
	const project = snapshot.getProject(configFile);
	assert.ok(project, `TypeScript 7 did not load ${configFile}`);
	return project;
}

/** Fetches the binary native AST for the virtual source file. */
function requiredNativeSource(project) {
	const source = project.program.getSourceFile(sourceFile);
	assert.ok(source, `TypeScript 7 did not load ${sourceFile}`);
	return source;
}

/** Creates the source-stable identity used for differential comparison. */
function factKey(start, end, name) {
	return `${start}:${end}:${name}`;
}

/** Uses TypeScript's canonical slash spelling for virtual callback paths. */
function normalizePath(value) {
	return value.replaceAll('\\', '/');
}
