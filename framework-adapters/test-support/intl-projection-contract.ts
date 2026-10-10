import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { expect } from 'vitest';
import { buildDiagnosticFixture } from './compiler-diagnostic-build.js';

const workspace = fileURLToPath(new URL('../../', import.meta.url));
const execute = promisify(execFile);

/** Builds and executes the same extracted projections through each adapter's paired artifacts. */
export async function verifyIntlProjectionContract(adapter: 'vite' | 'webpack' | 'bun') {
	await mkdir(path.join(workspace, '.tmp'), { recursive: true });
	const root = await mkdtemp(path.join(workspace, '.tmp/intl-projection-adapter-'));
	try {
		await writeFile(
			path.join(root, 'package.json'),
			JSON.stringify({ name: 'intl-projections', private: true, type: 'module' })
		);
		await writeFile(path.join(root, 'exact.config.mjs'), 'export default {};');
		await writeFile(
			path.join(root, 'entry.tsx'),
			`import {renderToString} from '@exactjs/ssr';import {IntlProvider,createIntlEnvironment} from '@exactjs/intl';
class ProjectionDate extends Date {getTime(){return Number.NaN;}}
export function Page(){
 const date:Date=new ProjectionDate('2024-03-02T15:04:05Z');const invalid=new Date(Number.NaN);
 const words=new Set(['first','second']);const number=9007199254740993n;
 return()=> <output intl:message><span intl:unit="temperature-weather" intl:convert-to="celsius" difference>{80-50} °F</span> / <span intl:unit="fuel-economy-road" intl:convert-to="liter-per-100-kilometer" difference>{30-20} MPG</span> / {date.toLocaleString('en-US',{timeZone:'UTC'})} / {date.toLocaleDateString('en-US',{hour:'numeric',timeZone:'UTC'})} / {date.toLocaleTimeString('en-US',{year:'numeric',timeZone:'UTC'})} / {invalid.toLocaleString('en-US')} / {new Intl.ListFormat('en-US').format(words)} / {new Intl.NumberFormat('en-US',{style:'unit',unit:'mile'}).format(number)} / {new Intl.NumberFormat('en-US',{style:'unit',unit:'degree'}).format(Number.NaN)} / {new Intl.NumberFormat('en-US',{style:'unit',unit:'mile'}).format(Number.POSITIVE_INFINITY)}</output>;
}
export function Root(){return()=> <IntlProvider environment={createIntlEnvironment({locale:'en-US'})}><Page/></IntlProvider>;}
export async function run(){return (await renderToString(<Root/>,{markers:false})).html}`
		);
		for (const target of ['client', 'server'] as const) {
			const warnings = await buildDiagnosticFixture(adapter, root, target, true, true);
			expect(
				warnings.filter((warning) => /unsupported|cannot extract|conflicts/i.test(warning))
			).toEqual([]);
			const file = path.join(
				root,
				`out-${target}`,
				adapter === 'webpack' ? 'entry.cjs' : 'entry.js'
			);
			const code = await readFile(file, 'utf8');
			expect(code).toContain('prepareIntlActivation');
			if (target === 'client') continue;
			const runner = path.join(root, 'run.mjs');
			await writeFile(
				runner,
				`import * as entry from ${JSON.stringify(pathToFileURL(file).href)};console.log(JSON.stringify(await (entry.run??entry.default.run)()));`
			);
			const result = await execute(
				adapter === 'bun' ? (process.env.BUN_EXECUTABLE ?? 'bun') : process.execPath,
				[runner],
				{ cwd: root }
			);
			const date = new Date('2024-03-02T15:04:05Z');
			const expected = [
				date.toLocaleString('en-US', { timeZone: 'UTC' }),
				date.toLocaleDateString('en-US', { hour: 'numeric', timeZone: 'UTC' }),
				date.toLocaleTimeString('en-US', { year: 'numeric', timeZone: 'UTC' }),
				'Invalid Date',
				new Intl.ListFormat('en-US').format(['first', 'second']),
				new Intl.NumberFormat('en-US', { style: 'unit', unit: 'mile' }).format(9007199254740993n),
				new Intl.NumberFormat('en-US', { style: 'unit', unit: 'degree' }).format(Number.NaN),
				new Intl.NumberFormat('en-US', { style: 'unit', unit: 'mile' }).format(
					Number.POSITIVE_INFINITY
				)
			].join(' / ');
			expect(JSON.parse(result.stdout.trim())).toBe(
				`<output><span>16.667°C</span> / <span>-3.92 L/100 km</span> / ${expected}</output>`
			);
		}
	} finally {
		await rm(root, { recursive: true, force: true });
	}
}
