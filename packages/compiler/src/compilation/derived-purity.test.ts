import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { compileProjectArtifacts } from './artifact-compilation.js';
import { createTestWorkspace, writeTestFiles } from '../test-support/workspace.js';

async function compileHelper(body: string, annotation = '') {
	const root = await createTestWorkspace('derived-purity-', path.resolve('.tmp'));
	const files = await writeTestFiles(root, {
		'tracked.ts': `export function evaluate(/** @exact track */ callback:()=>string){ return callback(); }`,
		'helper.ts': `import {evaluate} from './tracked.js';
declare global { interface Array<T> { readonly fixtureTag?: string } interface Map<K,V> { readonly fixtureTag?: string } interface Date { readonly fixtureTag?: string } }
let counter = 0;
const shared = { value: '' };
class ImpostorString { trim() { counter++; return 'changed'; } }
const fake = new ImpostorString();
function change(value: string) { counter++; return value; }
function fakeTrack(callback:()=>string = () => "@exact track") { counter++; return callback(); }
${annotation}
export function helper(value: string): string { ${body} }`,
		'Probe.tsx': `import { helper } from './helper.js';
export function Probe(props: { value: string }) {
 const label = helper(props.value);
 return () => <p>{label}</p>;
}`
	});
	return compileProjectArtifacts([files['Probe.tsx']!], {
		rootDir: root,
		outDir: path.join(root, 'out'),
		serverComponents: true,
		generatedValidation: 'semantic'
	});
}

describe('derived helper safety across paired artifacts', () => {
	it.each([
		'return value.trim();',
		'return Array.isArray([value]) ? value : "";',
		'return evaluate(()=>value.trim());',
		'const map: ReadonlyMap<string,string> = new Map([["key", value]]); return map.get("key") ?? "";',
		'const map = new Map([["key", value]]); return map.get("key") ?? "";',
		'return String(new Date(Number(value)).getTime());',
		'return [value].map(v => v.trim()).join("");'
	])('infers supported built-in operations: %s', async (body) => {
		await expect(compileHelper(body)).resolves.toBeDefined();
	});

	it.each([
		'return [value].map(v => { const alias = shared; alias.value = v; return v; }).join("");',
		'return [shared].map(alias => { alias.value = value; return value; }).join("");',
		'return fake.trim() + value;',
		'counter++; return value + "@exact pure";',
		'/* @exact pure */ counter++; return value;',
		'return [value].map(change).join("");',
		'return fakeTrack(()=>value);'
	])('rejects external effects without trusting local names or body text: %s', async (body) => {
		await expect(compileHelper(body)).rejects.toThrow(/EXACT2202[\s\S]*helper\.ts:\d+:\d+/);
	});

	it('explains an unsupported operation and accepts a truthful helper assertion', async () => {
		const body = 'const values: string[] = []; values.push(value); return values.join("");';
		await expect(compileHelper(body)).rejects.toThrow(/values\.push\(value\)[\s\S]*@exact pure/);
		await expect(compileHelper(body, '/** @exact pure */')).resolves.toBeDefined();
	});
});
