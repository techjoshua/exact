import { writeFile } from 'node:fs/promises';
import path from 'node:path';

/** Writes an application-owned enhancement with no foreign library marker. */
export async function writeApplicationRootFixture(root: string) {
	await writeFile(
		path.join(root, 'package.json'),
		JSON.stringify({ name: '@fixture/own-root', private: true, type: 'module' })
	);
	await writeFile(
		path.join(root, 'tsconfig.json'),
		JSON.stringify({
			compilerOptions: {
				target: 'ES2022',
				module: 'ESNext',
				moduleResolution: 'Bundler',
				jsx: 'preserve',
				jsxImportSource: '@exactjs/jsx',
				skipLibCheck: true
			},
			include: ['*.tsx']
		})
	);
	await writeFile(
		path.join(root, 'exact.config.mjs'),
		`export * as own from './Enhancements.tsx' with {type:'exact-enhancement',scope:'package'};export default {};`
	);
	await writeFile(
		path.join(root, 'Enhancement.tsx'),
		`import{type Child}from'@exactjs/core';export function Value(props:{value:string;children?:Child}){return()=> <aside data-root={props.value}>{props.children}</aside>;}`
	);
	await writeFile(
		path.join(root, 'Enhancements.tsx'),
		`export {Value as value} from './Enhancement.tsx' with {type:'exact-enhancement'};`
	);
	await writeFile(
		path.join(root, 'entry.tsx'),
		`import{renderToString}from'@exactjs/ssr';/** @exact server */export function Page(){return()=> <p own:value="owned">Ready</p>;}export async function run(){return(await renderToString(<Page/>,{markers:false})).html;}`
	);
}
