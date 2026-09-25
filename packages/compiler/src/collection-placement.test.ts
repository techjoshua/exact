import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { compileProjectArtifacts } from './index.js';
import { analyzeSource } from './compilation/source-analysis.js';
import { artifactAnalysis } from './compilation/analysis-results.js';

describe('collection receiver placement', () => {
	it.each([
		['Map<string, string>', 'get("key")'],
		['ReadonlyMap<string, string>', 'get("key")'],
		['ReadonlyMap<string, string>', '["get"]("key")'],
		['ReadonlyMap<string, string>', '[String("get") as "get"]("key")'],
		['Set<string>', 'has("key")'],
		['ReadonlySet<string>', 'has("key")'],
		['Array<string>', 'includes("key")'],
		['ReadonlyArray<string>', 'includes("key")'],
		['readonly string[]', 'includes("key")']
	])('keeps %s %s environment-neutral', (type, operation) => {
		for (const annotation of [type, 'Rows']) {
			const analysis = analyzeSource(
				`type Rows = ${type};
		 export function lookup(rows: ${annotation}) { return rows${operation.startsWith('[') ? '' : '.'}${operation}; }`,
				{ filename: 'lookup.ts' }
			);
			expect(analysis.callables.find((value) => value.name === 'lookup')?.effect).toBe('neutral');
		}
	});

	it.each(['ReadonlyMap', 'ReadonlySet', 'ReadonlyArray'])(
		'does not trust an application type named %s',
		(type) => {
			const analysis = analyzeSource(
				`export {}; interface ${type} { read(): string }
		 export function lookup(rows: ${type}) { return rows.read(); }`,
				{ filename: 'custom.ts' }
			);
			expect(analysis.callables.find((value) => value.name === 'lookup')?.effect).toBe('unknown');
		}
	);

	it.each(['Map', 'ReadonlyMap'])(
		'compiles an imported %s lookup after a server continuation',
		async (type) => {
			const root = await mkdtemp(path.join(tmpdir(), 'exact-map-placement-'));
			try {
				await symlink(
					fileURLToPath(new URL('../../../node_modules', import.meta.url)),
					path.join(root, 'node_modules'),
					'dir'
				);
				await writeFile(
					path.join(root, 'helper.ts'),
					`export function lookup(rows: ${type}<string, string>, key: string) { return rows.get(key) ?? ''; }`
				);
				const entry = path.join(root, 'Probe.tsx');
				await writeFile(
					entry,
					`import { TaskContext, type Component } from '@exactjs/core';
			import { lookup } from './helper.js';
			export function Probe(this: Component<{ rows: Map<string, string>; request: number }>, props: { id: string }) {
			 this.state.rows = new Map<string, string>(); this.state.request = 0;
			 function verdict(task: TaskContext = TaskContext.server()) { return 'done'; }
			 const run = async (request: number, key: string) => {
			  if (request === 0) return;
			  const result = await verdict();
			  this.state.rows.set(key, lookup(this.state.rows, key) + result);
			 };
			 void run(this.state.request, props.id);
			 return () => <button onClick={() => this.state.request++}>{this.state.rows.get(props.id)}</button>;
			}`
				);
				const results = await compileProjectArtifacts([entry], {
					rootDir: root,
					outDir: path.join(root, 'out'),
					serverComponents: true,
					generatedValidation: 'semantic'
				});
				expect(artifactAnalysis(results[0]!).components[0]?.artifactTargets).toEqual([
					'client',
					'server'
				]);
			} finally {
				await rm(root, { recursive: true, force: true });
			}
		}
	);
});
