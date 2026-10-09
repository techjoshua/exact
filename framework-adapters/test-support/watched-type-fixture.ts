import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createConfigurationWatchFixture } from './configuration-watch.js';

/** Creates a consumer whose emitted child operations depend on a sibling declaration. */
export async function createWatchedTypeFixture() {
	const fixture = await createConfigurationWatchFixture();
	try {
		await fixture.configure(null);
		const dependencyRoot = path.join(fixture.root, 'types');
		await mkdir(dependencyRoot);
		await writeFile(
			path.join(dependencyRoot, 'tsconfig.json'),
			JSON.stringify({ compilerOptions: { skipLibCheck: true }, include: ['*.ts'] })
		);
		const dependency = path.join(dependencyRoot, 'index.d.ts');
		const update = (array: boolean) =>
			writeFile(
				dependency,
				`export interface Model {value:${array ? 'readonly string[]' : 'string'}}`
			);
		await update(false);
		await writeFile(
			path.join(fixture.root, 'page.tsx'),
			'import type {Model} from "./types/index.js";export function Page(props:Model){return()=> <p>{props.value}</p>; }'
		);
		await writeFile(
			path.join(fixture.root, 'entry.tsx'),
			`import {Page} from './page.js';import {renderToString} from '@exactjs/ssr';export const render=async(value=JSON.parse(process.argv[2] ?? '"initial"'))=> (await renderToString(<Page value={value}/>,{markers:false})).html;`
		);
		return { ...fixture, dependency, update };
	} catch (error) {
		await fixture.dispose();
		throw error;
	}
}

/** Executes a fresh emitted bundle with scalar or list props and reads its actual server HTML. */
export async function readWatchedTypeBundle(
	filename: string,
	array: boolean,
	runtime = process.execPath
): Promise<string> {
	const result = await promisify(execFile)(
		runtime,
		[filename, JSON.stringify(array ? ['one', 'two'] : 'initial')],
		{ timeout: 10000 }
	);
	if (result.stderr) throw new Error(result.stderr);
	return JSON.parse(result.stdout) as string;
}
