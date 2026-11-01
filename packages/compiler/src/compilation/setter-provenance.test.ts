import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { expect, it, onTestFinished } from 'vitest';
import { ExactCompilerSession } from '../expression/project.js';
import { createTestWorkspace } from '../test-support/workspace.js';

// A setter's body assignment becomes a producer only at its actual performed invocation.
// Namespace assertions retain independent effects and the reference captured before the RHS.
it.each([
	{
		name: 'original-setter-replacement',
		source:
			'const obj={item:{value:"safe"},set next(value:{value:string}){this.item=value}};obj.next={get value(){return document.title}};export const value=obj.item.value;export const stable="safe";',
		invalid: false,
		placement: 'client',
		expected: { client: { stable: 'safe', value: 'browser' }, server: { stable: 'safe' } }
	},
	{
		name: 'noop-setter',
		source:
			'const obj={item:{value:"safe"},set next(value:{value:string}){}};obj.next={get value(){return document.title}};export const value=obj.item.value;export const stable="safe";',
		invalid: false,
		placement: 'isomorphic',
		expected: {
			client: { stable: 'safe', value: 'safe' },
			server: { stable: 'safe', value: 'safe' }
		}
	},
	{
		name: 'unperformed-setter',
		source:
			'const obj={item:{value:"safe"},set next(value:{value:string}){this.item=value}};if(false)obj.next={get value(){return document.title}};export const value=obj.item.value;export const stable="safe";',
		invalid: false,
		placement: 'isomorphic',
		expected: {
			client: { stable: 'safe', value: 'safe' },
			server: { stable: 'safe', value: 'safe' }
		}
	},
	{
		name: 'alias-rhs-order',
		source:
			'let effects="";const input={get value(){return document.title}};const obj={item:{value:"safe"},set next(value:{value:string}){effects+="set";this.item=value}};const target=obj;target.next=(effects+="rhs",input);export const value=obj.item.value;export {effects};export const stable="safe";',
		invalid: false,
		placement: 'client',
		expected: {
			client: { stable: 'safe', value: 'browser', effects: 'rhsset' },
			server: { stable: 'safe', effects: 'rhsset' }
		}
	},
	{
		name: 'safe-replacement',
		source:
			'const obj={item:{get value(){return document.title}},set next(value:{value:string}){this.item=value}};obj.next={value:"safe"};export const value=obj.item.value;export const stable="safe";',
		invalid: false,
		placement: 'isomorphic',
		expected: {
			client: { stable: 'safe', value: 'safe' },
			server: { stable: 'safe', value: 'safe' }
		}
	},
	{
		name: 'receiver-acquired-before-rhs',
		source:
			'const other={item:{value:"other"},set next(value:{value:string}){this.item=value}};let obj={item:{value:"safe"},set next(value:{value:string}){this.item=value}};const old=obj;obj.next=(obj=other,{get value(){return document.title}});export const value=old.item.value;export const otherValue=obj.item.value;export const stable="safe";',
		invalid: false,
		placement: 'client',
		expected: {
			client: { stable: 'safe', value: 'browser', otherValue: 'other' },
			server: { stable: 'safe', otherValue: 'other' }
		}
	},
	{
		name: 'rebound-setter-parameter',
		source:
			'const obj={item:{value:"safe"},set next(value:{value:string}){value={value:"safe"};this.item=value}};obj.next={get value(){return document.title}};export const value=obj.item.value;export const stable="safe";',
		invalid: false,
		placement: 'isomorphic',
		expected: {
			client: { stable: 'safe', value: 'safe' },
			server: { stable: 'safe', value: 'safe' }
		}
	},
	{
		name: 'rhs-replaces-setter',
		source:
			'const obj={item:{value:"safe"},set next(value:{value:string}){this.item=value}};obj.next=(Object.defineProperty(obj,"next",{set(value:{value:string}){obj.item={value:"safe"}}}),{get value(){return document.title}});export const value=obj.item.value;export const stable="safe";',
		invalid: false,
		placement: 'unknown',
		expected: {
			client: { stable: 'safe', value: 'safe' },
			server: { stable: 'safe', value: 'safe' }
		}
	},
	{
		name: 'invalid-setter-input',
		source:
			'const obj={item:{value:"safe"},set next(value:{value:string}){this.item=value}};obj.next=1;export const value=obj.item.value;export const stable="safe";',
		invalid: true,
		placement: 'isomorphic',
		expected: {
			client: { stable: 'safe', value: 'safe' },
			server: { stable: 'safe', value: 'safe' }
		}
	}
])('preserves setter-mediated replacement for $name', async (test) => {
	const root = await createTestWorkspace('.exact-setter-producer-', process.cwd());
	const session = new ExactCompilerSession();
	onTestFinished(() => session.dispose());
	const configFile = path.join(root, 'tsconfig.json');
	await writeFile(
		configFile,
		'{"compilerOptions": {"target": "ES2022", "module": "ESNext", "moduleResolution": "Bundler", "strict": true, "skipLibCheck": true, "allowJs": true, "checkJs": false}, "files": ["entry.ts"]}'
	);
	const id = path.join(root, 'entry.ts');
	await writeFile(id, test.source);
	const synchronized = session.compileNative({
		kind: 'synchronize',
		root: process.cwd(),
		configFile,
		diagnostics: 'semantic',
		sources: [{ id, source: test.source }]
	});
	expect(synchronized.error).toBeUndefined();
	for (const target of ['client', 'server'] as const) {
		const compiled = session.compileNative({
			kind: 'compile',
			id,
			source: test.source,
			target,
			root: process.cwd(),
			configFile,
			diagnostics: 'semantic'
		});
		if (test.invalid) {
			expect(compiled.diagnostics).toEqual(
				expect.arrayContaining([expect.objectContaining({ code: 'TS2322', severity: 'error' })])
			);
			continue;
		}
		expect(synchronized.diagnostics).toEqual([]);
		expect(compiled.error).toBeUndefined();
		expect(compiled.diagnostics).toEqual([]);
		expect(compiled.analysis?.exports.find((value) => value.name === 'value')?.placement).toBe(
			test.placement
		);
		const filename = path.join(root, target + '.mts');
		await writeFile(filename, compiled.code!);
		const result = spawnSync(
			process.execPath,
			[
				'--input-type=module',
				'-e',
				(target === 'client' ? 'globalThis.document={title:"browser"};' : '') +
					`console.log(JSON.stringify(await import(${JSON.stringify(pathToFileURL(filename).href)})));`
			],
			{ encoding: 'utf8' }
		);
		expect(result.status, result.stderr).toBe(0);
		expect(JSON.parse(result.stdout)).toEqual(test.expected[target]);
	}
});
