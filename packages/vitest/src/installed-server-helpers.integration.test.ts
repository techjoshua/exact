import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { compileFileArtifacts } from '@exactjs/compiler';
import { expect, it, onTestFinished } from 'vitest';
import { copyInstalledRuntimePackages } from '../../../framework-adapters/test-support/installed-runtime-packages.js';
import { createInstalledThemeFixture } from '../../../framework-adapters/test-support/installed-theme.js';

it.each(['node', 'jsdom', 'node-source-server', 'node-source-client'])(
	'renders an installed library and its theme through paired helpers in %s',
	async (environment) => {
		const fixture = await createInstalledThemeFixture('library');
		onTestFinished(fixture.dispose);
		const { root, workspace } = fixture;
		await copyInstalledRuntimePackages(root, [
			'@exactjs/ssr',
			'@exactjs/server',
			'@exactjs/testing',
			'@exactjs/devtools-runtime'
		]);
		const sourceFixture = environment.startsWith('node-source');
		const serverSource = environment === 'node-source-server';
		const page = path.join(root, 'TestPage.tsx');
		await writeFile(
			page,
			`import {Page} from '@fixture/page';
/** @exact server */
export function TestPage(){return()=> <Page/>;}`
		);
		await compileFileArtifacts(page, {
			rootDir: root,
			outDir: path.join(root, 'generated'),
			serverComponents: true
		});
		const progress = path.join(root, 'progress.ts');
		await writeFile(
			progress,
			`import {createTaskProgressReporter} from '@exactjs/core/framework/server-task-helpers';import type {TaskContext} from '@exactjs/core';export function bindProgress(task:TaskContext){return createTaskProgressReporter('progress',task);}`
		);
		await compileFileArtifacts(progress, {
			rootDir: root,
			outDir: path.join(root, 'generated'),
			serverComponents: true
		});
		await writeFile(
			path.join(root, 'helper.tsx'),
			`import {TestPage} from '${sourceFixture ? './TestPage.js' : './generated/TestPage.exact.server.js'}';export function serverFixture(){return <TestPage/>;}`
		);
		await writeFile(
			path.join(root, 'paired.test.ts'),
			`import {it,expect} from ${JSON.stringify(pathToFileURL(path.join(workspace, 'node_modules/vitest/dist/index.js')).href)};
import {serverFixture} from './helper.js';import {bindProgress} from './generated/progress.exact.server.js';import {createExactContinuationHandler} from '@exactjs/server';import {renderToString} from '@exactjs/ssr';
it('uses server receipts and theme registration',async()=>{const {html}=await renderToString(serverFixture());expect(html).toContain('data-exact-theme-appearance="dark"');expect(html).toContain('value="1,234"');
const reports=[];let retained;
const contract={id:'task',componentId:'page',kind:'task',dependencies:[],stateReads:[],stateWrites:[],publicContexts:[],serverContexts:[],contextWrites:[],boundaries:[],progress:[{id:'progress'}]};
const handler=createExactContinuationHandler(contract,{id:'task',componentId:'page',execute(activation,execution){retained=bindProgress(execution.task);retained(42);return {state:activation.state};}});
await handler({type:'invoke',id:'task',payload:{dependencies:[]},state:{}},{reportTaskProgress:(id,snapshot)=>reports.push([id,snapshot])});
expect(reports).toEqual([['progress',42]]);retained(99);expect(reports).toHaveLength(1);
});`
		);
		await writeFile(
			path.join(root, 'vitest.config.mjs'),
			`import {defineConfig} from ${JSON.stringify(pathToFileURL(path.join(workspace, 'node_modules/vitest/dist/config.js')).href)};
import {exactVitest} from ${JSON.stringify(pathToFileURL(path.join(workspace, 'packages/vitest/dist/index.js')).href)};
export default defineConfig({plugins:[exactVitest(${serverSource ? "{compiler:{target:'server'}}" : '{}'})],server:{fs:{allow:[${JSON.stringify(workspace)},${JSON.stringify(root)}]}},test:{environment:${JSON.stringify(sourceFixture ? 'node' : environment)},include:['paired.test.ts']}});`
		);
		const run = () =>
			execFileSync(
				process.execPath,
				[
					path.join(workspace, 'node_modules/vitest/vitest.mjs'),
					'run',
					'--root',
					root,
					'--config',
					'vitest.config.mjs'
				],
				{ cwd: root, encoding: 'utf8', timeout: 60000, stdio: ['ignore', 'pipe', 'pipe'] }
			);
		if (environment === 'node-source-client') {
			expect(run).toThrow('Server renderer received a client component receipt');
		} else {
			expect(run()).toContain('1 passed');
		}
	},
	90000
);
