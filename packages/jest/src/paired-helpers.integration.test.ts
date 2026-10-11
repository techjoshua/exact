import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it, onTestFinished } from 'vitest';
import { writePairedTestHelpers } from '../../../framework-adapters/test-support/paired-test-helpers.js';

it('retains an SSR helper alongside a client fixture in the default Jest host', async () => {
	const workspace = fileURLToPath(new URL('../../../', import.meta.url));
	const root = await mkdtemp(path.join(workspace, '.tmp/paired-jest-'));
	onTestFinished(() => rm(root, { recursive: true, force: true }));
	await writePairedTestHelpers(root);
	await writeFile(
		path.join(root, 'jest.config.mjs'),
		`import {exactJest} from '@exactjs/jest';export default {...exactJest(),rootDir:'.',testMatch:['<rootDir>/paired.test.ts']};`
	);
	await writeFile(
		path.join(root, 'paired.test.ts'),
		`import {it,expect} from '@jest/globals';
import {serverFixture} from './src/helper.js';import {runServerProgress} from './src/progress-check.js';import {Counter} from './src/client.js';
import {testComponent} from '@exactjs/jest';import {renderToString} from '@exactjs/ssr';
it('preserves both projections',async()=>{
expect((await renderToString(serverFixture())).html).toContain('Visible');
expect(await runServerProgress()).toEqual([['progress',42]]);
const view=await testComponent(Counter).mount();try{const button=view.getByRole('button');await button.click();expect(button).toHaveText('1');}finally{view.unmount();}});`
	);
	const output = execFileSync(
		process.execPath,
		[
			'--experimental-vm-modules',
			path.join(workspace, 'node_modules/jest/bin/jest.js'),
			'--config',
			path.join(root, 'jest.config.mjs'),
			'--runInBand'
		],
		{ cwd: workspace, encoding: 'utf8', timeout: 60000, stdio: ['ignore', 'pipe', 'pipe'] }
	);
	expect(output).toBeDefined();
}, 90000);
