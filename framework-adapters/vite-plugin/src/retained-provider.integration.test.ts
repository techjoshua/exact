import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildInstalledIslands } from '../../test-support/build-installed-islands.js';
import { it, expect, onTestFinished } from 'vitest';
import { exact } from './index.js';
import { createInstalledReportFixture } from '../../test-support/installed-report.js';
import { createInstalledProviderFixture } from '../../test-support/installed-provider.js';
import { copyInstalledRuntimePackages } from '../../test-support/installed-runtime-packages.js';

it.each(['vite', 'bun', 'webpack'] as const)(
	'retains server children beneath a standalone transparent theme provider (%s)',
	async (adapter) => {
		const fixture = await createInstalledProviderFixture();
		onTestFinished(fixture.dispose);
		await copyInstalledRuntimePackages(fixture.root, ['@exactjs/hydrate']);
		await writeFile(
			path.join(fixture.root, 'Page.tsx'),
			`import {Provider, Toggle} from '@fixture/page';
import type {Child} from '@exactjs/core';
function Header(props:{children?:Child}){return()=> <header>{props.children}</header>}
function footer(){return <footer>Footer</footer>}
function Shell(props:{children?:Child}){return()=> <div><Provider appearance="light"><section><Header><Toggle/></Header>{props.children}{footer()}</section></Provider></div>}
/** @exact server */
export function Page(){return()=> <main><Shell><p data-retained>Retained content</p></Shell></main>;}`
		);
		await writeFile(
			path.join(fixture.root, 'server.tsx'),
			`import {Page} from './Page.js';import {renderToHydratableString} from '@exactjs/ssr';export const output=()=>renderToHydratableString(<Page/>);`
		);
		await writeFile(
			path.join(fixture.root, 'client.tsx'),
			`import {createExactClient,lazyClientIsland} from '@exactjs/hydrate';export async function exercise(html:string){const container=document.createElement('div');container.innerHTML=html;document.body.append(container);const retained=container.querySelector('[data-retained]');const names=[...container.querySelectorAll('[data-exact-client-name]')].map(e=>e.getAttribute('data-exact-client-name'));const errors:unknown[]=[];const client=createExactClient(container,{islands:{Provider:lazyClientIsland(()=>import('@fixture/page').then(m=>m.Provider)),Toggle:lazyClientIsland(()=>import('@fixture/page').then(m=>m.Toggle))},onErrorReport:r=>errors.push(String(r.error)),hydration:{strategy:'eager'}});await new Promise(resolve=>setTimeout(resolve,100));const hydrated=container.querySelectorAll('[data-exact-client-hydrated=\"true\"]').length;container.querySelector('button')?.click();const dark=container.innerHTML;container.querySelector('button')?.click();const result={hydrated,dark,html:container.innerHTML,retained:retained===container.querySelector('[data-retained]'),names,errors};client.dispose();container.remove();return result;}`
		);
		await buildInstalledIslands(adapter, fixture.root, {
			library: '@fixture/page',
			stylesheet: false
		});
		const runner = path.join(fixture.root, 'exercise.mjs');
		await writeFile(
			runner,
			`import {installPerformanceDom} from ${JSON.stringify(pathToFileURL(path.join(fixture.workspace, 'scripts/performance/dom-environment.mjs')).href)};const dom=installPerformanceDom();try{const client=await import('./out/client.mjs');const server=await import('./out/server.mjs');const output=await server.output();console.log(JSON.stringify({before:output.html,...await client.exercise(output.html)}));}finally{dom.window.close();}`
		);
		const result = await promisify(execFile)(process.execPath, [runner], { timeout: 30000 });
		const observation = JSON.parse(result.stdout.trim());
		expect(observation.errors).toEqual([]);
		expect(observation.names).toContain('Provider');
		expect(observation.hydrated).toBeGreaterThanOrEqual(2);
		expect(observation.dark).toContain('data-exact-theme-appearance="dark"');
		expect(observation.html).toContain('data-exact-theme-appearance="light"');
		expect(observation.retained).toBe(true);
		expect(observation.html).toContain('Retained content');
	},
	60000
);

it.each([
	['vite', 'enhanced'],
	['bun', 'enhanced'],
	['webpack', 'enhanced'],
	['vite', 'plain'],
	['vite', 'explicit']
] as const)(
	'renders published component spreads and retains handler props under their client owner (%s, %s)',
	async (adapter, mode) => {
		const fixture = await createInstalledReportFixture(mode);
		onTestFinished(fixture.dispose);
		await buildInstalledIslands(adapter, fixture.root, {
			library: '@fixture/page',
			stylesheet: false
		});
		const runner = path.join(fixture.root, 'render.mjs');
		await writeFile(
			runner,
			`import {installPerformanceDom} from ${JSON.stringify(pathToFileURL(path.join(fixture.workspace, 'scripts/performance/dom-environment.mjs')).href)};const dom=installPerformanceDom();try{const client=await import('./out/client.mjs');const server=await import('./out/server.mjs');const output=await server.output();console.log(JSON.stringify({...output,streamed:await server.streamed(),journey:await client.exercise(output.html)}));}finally{dom.window.close();}`
		);
		const result = await promisify(execFile)(process.execPath, [runner], { timeout: 30000 });
		const output = JSON.parse(result.stdout.trim());
		expect(output.html.match(/class="tile-value"/g)).toHaveLength(3);
		expect(output.html).toContain('First');
		expect(output.html).toContain('Second');
		expect(output.streamed.match(/class="tile-value"/g)).toHaveLength(3);
		expect(output.journey).toEqual({
			labels: ['Hovered1', 'Hovered2'],
			retained: true,
			cleaned: true,
			errors: []
		});
	},
	60000
);
