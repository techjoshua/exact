/** @vitest-environment jsdom */
import path from 'node:path';
import { expect, it, onTestFinished } from 'vitest';
import { render, dispose } from '@exactjs/dom';
import { renderToString } from '@exactjs/ssr';
import type { Child } from '@exactjs/core';
import { compileFileArtifacts } from '../index.js';
import { createTestWorkspace, writeTestFiles } from '../test-support/workspace.js';
import { importArtifact } from '../test-support/import-artifact.js';

it('executes declaration-only application Date methods in paired artifacts', async () => {
	const root = await createTestWorkspace('.exact-native-method-', process.cwd());
	const files = await writeTestFiles(root, {
		'helper.d.ts': `export declare class Date {/** @exact pure */ toLocaleString(locale?:string):string;/** @exact pure */ toLocaleDateString(locale?:string):string;/** @exact pure */ toLocaleTimeString(locale?:string):string;}`,
		'helper.js': `export class Date {toLocaleString(){return 'authored'}toLocaleDateString(){return 'day'}toLocaleTimeString(){return 'clock'}}`,
		'page.tsx': `import {Date} from './helper.js';export function Page(props:{value:Date}){return()=> <output>{props.value.toLocaleString('en-US')}:{props.value.toLocaleDateString('en-US')}:{props.value.toLocaleTimeString('en-US')}</output>;}export function root(){return <Page value={new Date()}/>;}`
	});
	const compiled = await compileFileArtifacts(files['page.tsx']!, { rootDir: root, outDir: root });
	const client = await importArtifact(compiled.clientFile, path.join(root, 'client.mjs'));
	const server = await importArtifact(compiled.serverFile, path.join(root, 'server.mjs'));
	const host = document.createElement('div');
	onTestFinished(() => dispose(host, true));
	render((client.root as () => Child)(), host);
	expect(host.querySelector('output')?.textContent).toBe('authored:day:clock');
	const rendered = await renderToString((server.root as () => Child)(), { markers: false });
	expect(rendered.html).toBe('<output>authored:day:clock</output>');
});
