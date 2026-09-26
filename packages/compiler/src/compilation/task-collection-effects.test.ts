import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, it } from 'vitest';
import { compileFileArtifacts } from '../index.js';
import { createTestWorkspace } from '../test-support/workspace.js';
import { importArtifact } from '../test-support/import-artifact.js';
import { composeExactExecutorContract } from '@exactjs/server';
import type { AnyComponentFunction } from '@exactjs/core';

it.each(['function', 'arrow'])('publishes collection effects from a %s task', async (form) => {
	const root = await createTestWorkspace('.exact-collection-effects-', process.cwd());
	const source = path.join(root, 'Page.tsx');
	const signature =
		form === 'function'
			? 'function update(task:TaskContext=TaskContext.server())'
			: 'const update=(task:TaskContext=TaskContext.server())=>';
	await writeFile(
		source,
		`import {TaskContext,type Component} from '@exactjs/core';
export function Page(this:Component<{rows:Map<string,number>; selected:Set<string>}>) {
this.state.rows=new Map([['a',0]]); this.state.selected=new Set(['a']);
${signature} { this.state.rows.set('a',1); this.state.selected.add('b'); }
return ()=> <button onClick={()=>update()}>{this.state.rows.get('a')}</button>;
}`
	);
	const compiled = await compileFileArtifacts(source, { rootDir: root, outDir: root });
	expect(compiled.build.operations[0]?.stateWrites).toEqual(
		expect.arrayContaining([
			expect.objectContaining({ path: 'rows', operation: 'map' }),
			expect.objectContaining({ path: 'selected', operation: 'set' })
		])
	);
	const module = await importArtifact(compiled.serverFile, path.join(root, 'server.mjs'));
	const contract = composeExactExecutorContract([module.Page as AnyComponentFunction]);
	const operation = Object.values(contract.invocations)[0]!;
	expect(operation.stateWrites.map((entry) => entry.path).sort()).toEqual(['rows', 'selected']);
	expect(operation.stateWrites).toEqual(
		expect.arrayContaining([
			expect.objectContaining({ path: 'rows', operation: 'map' }),
			expect.objectContaining({ path: 'selected', operation: 'set' })
		])
	);
});
