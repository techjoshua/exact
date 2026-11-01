import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { compileProjectArtifacts } from '@exactjs/compiler';
import assert from 'node:assert/strict';
import { assertComponentChildInputSsr } from '../../framework-adapters/test-support/component-child-input-ssr-assertions.mjs';

/** Prepares one real generated SSR input family once for the unchanged native host matrix. */
export async function prepareChildInputs(root, temporary) {
	const corpus = path.join(root, 'packages/component-composition-corpus/test-support');
	const source = path.join(temporary, 'ChildInputContract.tsx');
	await writeFile(source, await readFile(path.join(corpus, 'component-child-input.fixtures.tsx')));
	const artifacts = await compileProjectArtifacts([source], {
		rootDir: temporary,
		outDir: path.join(temporary, 'child-input-artifacts'),
		serverComponents: true
	});
	await writeFile(
		path.join(temporary, 'child-input-artifacts.json'),
		JSON.stringify(artifacts, null, 2)
	);
	const artifact = artifacts.find((value) => value.inputFile === source);
	assert.ok(artifact, 'Missing real child input artifact');
	const handler = path.join(temporary, 'child-input-handler.mjs');
	await writeFile(
		handler,
		`import {ChildInputAccessor,ChildInputLeaf} from ${JSON.stringify(artifact.serverFile)};
import {createPreparedServerComponentInputReference as receipt,createCompiledFragmentReceipt as fragment} from '@exactjs/core/runtime/component-operations';
import {renderToString} from '@exactjs/ssr';
import {observeComponentChildInputSsr} from ${JSON.stringify(path.join(corpus, 'component-child-input-ssr.mjs'))};
export async function childInputResponse(){return Response.json(await observeComponentChildInputSsr({receipt,fragment,renderToString,Accessor:ChildInputAccessor,Leaf:ChildInputLeaf}));}`
	);
	return handler;
}

/** Records real host output before enforcing the shared original-receiver and acquisition oracles. */
export async function checkChildInputs(origin, record) {
	const response = await fetch(new URL('/component-child-inputs', origin));
	const text = await response.text();
	let rows;
	try {
		rows = JSON.parse(text);
	} catch {
		await record({ status: response.status, text });
		throw new Error('Child input host returned invalid JSON');
	}
	await record({ status: response.status, rows });
	assert.equal(response.status, 200);
	assertComponentChildInputSsr(rows);
}
