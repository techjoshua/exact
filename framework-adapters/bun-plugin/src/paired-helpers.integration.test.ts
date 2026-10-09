import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, it, onTestFinished } from 'vitest';
import { writePairedTestHelpers } from '../../test-support/paired-test-helpers.js';

it('retains an SSR helper alongside a client fixture in the default Bun test host', async () => {
	const root = await mkdtemp(path.resolve('.tmp/paired-bun-'));
	onTestFinished(() => rm(root, { recursive: true, force: true }));
	await writePairedTestHelpers(root);
	await writeFile(
		path.join(root, 'preload.ts'),
		`import {configureExactBunTest} from '@exactjs/bun-test';configureExactBunTest();`
	);
	await writeFile(
		path.join(root, 'paired.test.ts'),
		`import {it,expect} from 'bun:test';
import {serverFixture} from './src/helper.js';import {runServerProgress} from './src/progress-check.js';import {Counter} from './src/client.js';
import {testComponent} from '@exactjs/bun-test';import {renderToString} from '@exactjs/ssr';
it('preserves both projections',async()=>{
expect((await renderToString(serverFixture())).html).toContain('Visible');
expect(await runServerProgress()).toEqual([['progress',42]]);
const view=await testComponent(Counter).mount();try{const button=view.getByRole('button');await button.click();expect(button).toHaveText('1');}finally{view.unmount();}});`
	);
	expect(() =>
		execFileSync(
			'bun',
			['--conditions=browser', 'test', '--preload', './preload.ts', './paired.test.ts'],
			{ cwd: root, encoding: 'utf8', timeout: 60000, stdio: ['ignore', 'pipe', 'pipe'] }
		)
	).not.toThrow();
}, 90000);
