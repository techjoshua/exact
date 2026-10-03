import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const workspace = fileURLToPath(new URL('../../', import.meta.url));
const execute = promisify(execFile);

/** Each adapter must retain an imported helper's diagnostic and accept its truthful contract. */
export async function verifyCompilerDiagnostics(
	adapter: 'vite' | 'webpack' | 'bun'
): Promise<void> {
	await mkdir(path.join(workspace, '.tmp'), { recursive: true });
	const root = await mkdtemp(path.join(workspace, '.tmp/diagnostic-adapter-'));
	try {
		await Promise.all([
			writeFile(
				path.join(root, 'package.json'),
				JSON.stringify({ name: '@fixture/compiler-diagnostics', type: 'module', private: true })
			),
			writeFile(path.join(root, 'exact.config.mjs'), 'export default {};'),
			writeFile(
				path.join(root, 'tsconfig.json'),
				JSON.stringify({
					compilerOptions: {
						target: 'ESNext',
						module: 'ESNext',
						moduleResolution: 'Bundler',
						jsx: 'preserve',
						strict: true
					},
					include: ['*.tsx', '*.ts']
				})
			),
			writeFile(
				path.join(root, 'entry.tsx'),
				`import { helper } from './helper.js'; export function Page(props:{value:string}){const label=helper(props.value);return ()=> <p>{label}</p>;}`
			)
		]);
		const helper = `export function helper(value:string){const values:string[]=[];values.push(value);return values.join('');}`;
		for (const target of ['client', 'server'] as const) {
			await writeFile(path.join(root, 'helper.ts'), helper);
			let failure: unknown;
			try {
				await build(adapter, root, target);
			} catch (error) {
				failure = error;
			}
			assert.ok(failure, `${adapter}/${target} accepted an unproven helper`);
			const message = String(failure);
			for (const text of ['EXACT2202', 'values.push(value)', '@exact pure', 'helper.ts'])
				assert.ok(message.includes(text), `${adapter}/${target} lost ${text}: ${message}`);
			await writeFile(path.join(root, 'helper.ts'), '/** @exact pure */\n' + helper);
			await build(adapter, root, target);
		}
		await verifyDestructuredStateBuild(adapter, root);
		await verifySecretAliasBuild(adapter, root);
		await verifyDeclaredSecretReceipt(adapter, root);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
}

async function build(
	adapter: 'vite' | 'webpack' | 'bun',
	root: string,
	target: 'client' | 'server'
) {
	const options = {
		applicationRoot: root,
		target,
		serverComponents: true,
		reactCompatibility: false
	};
	const outdir = path.join(root, `out-${target}`);
	if (adapter === 'vite') {
		const require = createRequire(new URL('../vite-plugin/package.json', import.meta.url));
		const { build } = await import(pathToFileURL(require.resolve('vite')).href);
		const { exact } = await import('../vite-plugin/src/index.js');
		await build({
			root,
			configFile: false,
			logLevel: 'silent',
			plugins: [exact(options)],
			build: {
				outDir: outdir,
				ssr: target === 'server' ? path.join(root, 'entry.tsx') : false,
				lib: { entry: path.join(root, 'entry.tsx'), formats: ['es'], fileName: 'entry' },
				minify: false
			}
		});
	} else if (adapter === 'webpack') {
		const { default: webpack } = await import('webpack');
		const { ExactWebpackPlugin } = await import('../webpack-plugin/dist/index.js');
		const compiler = webpack({
			mode: 'development',
			target: 'node',
			context: root,
			entry: './entry.tsx',
			output: { path: outdir, filename: 'entry.cjs' },
			resolve: {
				extensions: ['.tsx', '.ts', '.js'],
				extensionAlias: { '.js': ['.js', '.ts', '.tsx'] }
			},
			resolveLoader: { modules: [path.join(workspace, 'node_modules')] },
			plugins: [new ExactWebpackPlugin(options)]
		});
		try {
			await new Promise<void>((resolve, reject) =>
				compiler.run((error, stats) => {
					if (error) reject(error);
					else if (!stats || stats.hasErrors())
						reject(
							new Error(stats?.toString({ all: false, errors: true }) ?? 'Missing Webpack stats')
						);
					else resolve();
				})
			);
		} finally {
			await new Promise<void>((resolve, reject) =>
				compiler.close((error) => (error ? reject(error) : resolve()))
			);
		}
	} else {
		const runner = path.join(root, 'build.mjs');
		await writeFile(
			runner,
			`import {exact} from ${JSON.stringify(new URL('../bun-plugin/dist/index.js', import.meta.url).href)};
const plugin=exact(${JSON.stringify(options)});
try { const result=await Bun.build({entrypoints:[${JSON.stringify(path.join(root, 'entry.tsx'))}],outdir:${JSON.stringify(outdir)},target:'bun',plugins:[plugin]});
 if(!result.success) throw new Error(result.logs.map(log=>log.message).join('\\n'));
} finally {await plugin.dispose();}`
		);
		await execute(process.env.BUN_EXECUTABLE ?? 'bun', [runner], { cwd: root });
	}
}

/** Builds corrected state patterns through each adapter. Native semantic tests own type rejection. */
async function verifyDestructuredStateBuild(adapter: 'vite' | 'webpack' | 'bun', root: string) {
	const source = `import type {Component} from '@exactjs/core';
 export function Page(this:Component<{values:number[]}>){
  this.state.values=[];
  return ()=> <button onClick={()=>{
   const next=[1,2];
   ({items:this.state.values}={items:next});
   [this.state.values]=[next];
  }}>{this.state.values.length}</button>;
 }`;
	for (const target of ['client', 'server'] as const) {
		await writeFile(path.join(root, 'entry.tsx'), source);
		await build(adapter, root, target);
	}
}

/** Type-only imports must retain secret enforcement through every adapter and target. */
async function verifySecretAliasBuild(adapter: 'vite' | 'webpack' | 'bun', root: string) {
	await writeFile(
		path.join(root, 'qualification.ts'),
		`import type {Secret} from '@exactjs/secrets';
		export type Credential<T> = Secret<T>;
		export interface SecretLooking { value: string }`
	);
	await writeFile(
		path.join(root, 'credential.ts'),
		`export type { Credential, SecretLooking } from './qualification.js';`
	);
	for (const target of ['client', 'server'] as const) {
		await writeFile(
			path.join(root, 'entry.tsx'),
			`import type {Credential} from './credential.js';
			export function Page(props:{token:Readonly<Credential<string>>}){
				return ()=> <p>{String(props.token)}</p>;
			}`
		);
		let failure: unknown;
		try {
			await build(adapter, root, target);
		} catch (error) {
			failure = error;
		}
		assert.ok(failure, `${adapter}/${target} accepted an aliased secret output`);
		assert.ok(String(failure).includes('EXACT3020'), String(failure));
		await writeFile(
			path.join(root, 'entry.tsx'),
			`import {TaskContext,type Component} from '@exactjs/core';
			import type {Credential} from './credential.js';
			export function Page(this:Component<{token:Credential<string>;label:string}>){
				function inspect(task:TaskContext=TaskContext.client()){void this.state.token;}
				return()=> <button onClick={()=>inspect()}>{this.state.label}</button>;
			}`
		);
		failure = undefined;
		try {
			await build(adapter, root, target);
		} catch (error) {
			failure = error;
		}
		assert.ok(failure, `${adapter}/${target} accepted a client read of aliased secret state`);
		assert.ok(
			String(failure).includes('client task reads or writes server-kept data'),
			String(failure)
		);

		await writeFile(
			path.join(root, 'entry.tsx'),
			`import type {SecretLooking} from './credential.js';
			export function Page(props:{token:Readonly<SecretLooking>}){
				return ()=> <p>{props.token.value}</p>;
			}`
		);
		await build(adapter, root, target);

		await writeFile(
			path.join(root, 'entry.tsx'),
			`import type {Credential} from './credential.js';
		declare function readCredential():Credential<string>;
		export function Page(){return()=> <p>{readCredential()}</p>;}`
		);
		failure = undefined;
		try {
			await build(adapter, root, target);
		} catch (error) {
			failure = error;
		}
		assert.ok(failure, `${adapter}/${target} accepted a secret callable result`);
		assert.ok(String(failure).includes('EXACT3020'), String(failure));

		await writeFile(
			path.join(root, 'entry.tsx'),
			`import type {Credential} from './credential.js';
		declare function readRecord():{credential:Credential<string>;label:string};
		export function Page(){return()=> <p>{readRecord().label}</p>;}`
		);
		await build(adapter, root, target);

		await writeFile(
			path.join(root, 'entry.tsx'),
			`import type {Credential} from './credential.js';
/** @exact shared */
declare function readCredential():Credential<string>;
export function Page(){return()=> <p>{readCredential()}</p>;}`
		);
		failure = undefined;
		try {
			await build(adapter, root, target);
		} catch (error) {
			failure = error;
		}
		assert.ok(failure, `${adapter}/${target} accepted annotation-erased secret qualification`);
		assert.ok(String(failure).includes('EXACT3001'), String(failure));

		for (const [member, rejected] of [
			['token', true],
			['label', false]
		] as const) {
			await writeFile(
				path.join(root, 'entry.tsx'),
				`import type {Credential} from './credential.js';
declare class Service{get token():Credential<string>;get label():string;}
declare const service:Service;
export function Page(){return()=> <p>{service.${member}}</p>;}`
			);
			failure = undefined;
			try {
				await build(adapter, root, target);
			} catch (error) {
				failure = error;
			}
			if (rejected) {
				assert.ok(failure, `${adapter}/${target} accepted a secret getter value`);
				assert.ok(String(failure).includes('EXACT3020'), String(failure));
			} else assert.equal(failure, undefined);
		}

		for (const qualified of [true, false]) {
			await writeFile(
				path.join(root, 'entry.tsx'),
				`import type {Credential} from './credential.js';
declare function read<T>():T;
export function Page(){return()=> <p>{read<${qualified ? 'Credential<string>' : 'string'}>()}</p>;}`
			);
			failure = undefined;
			try {
				await build(adapter, root, target);
			} catch (error) {
				failure = error;
			}
			if (qualified) {
				assert.ok(failure, `${adapter}/${target} accepted a secret generic result`);
				assert.ok(String(failure).includes('EXACT3020'), String(failure));
			} else assert.equal(failure, undefined);
		}

		for (const qualified of [true, false]) {
			for (const [definition, expression] of [
				[
					`declare function tag(strings:TemplateStringsArray):${qualified ? 'Credential<string>' : 'string'};`,
					'tag`value`'
				],
				[
					`declare const Maker:{new():${qualified ? 'Credential<{value:string}>' : '{value:string}'}};`,
					'JSON.stringify(new Maker())'
				]
			]) {
				await writeFile(
					path.join(root, 'entry.tsx'),
					`import type {Credential} from './credential.js';${definition}export function Page(){return()=> <p>{${expression}}</p>;}`
				);
				failure = undefined;
				try {
					await build(adapter, root, target);
				} catch (error) {
					failure = error;
				}
				if (qualified) {
					assert.ok(failure, `${adapter}/${target} accepted a secret invocation result`);
					assert.ok(String(failure).includes('EXACT3020'), String(failure));
				} else assert.equal(failure, undefined);
			}
		}

		for (const placement of ['server', 'client'] as const) {
			await writeFile(
				path.join(root, 'entry.tsx'),
				`import {TaskContext,type Component} from '@exactjs/core';
			import {consume} from '@exactjs/secrets';import type {Credential} from './credential.js';
			declare function readCredential():Credential<string>;
			export function Page(this:Component<{label:string}>){
			 const load=(_task:TaskContext=TaskContext.${placement}())=>{void consume(readCredential());this.state.label='Public';};
			 return()=> <button onClick={()=>load()}>{this.state.label}</button>;
			}`
			);
			failure = undefined;
			try {
				await build(adapter, root, target);
			} catch (error) {
				failure = error;
			}
			if (placement === 'server') assert.equal(failure, undefined);
			else assert.ok(failure, `${adapter}/${target} accepted client-owned secret consumption`);
		}
	}
}

/** Verify declared authority survives each adapter's imported helper resolution and target build. */
async function verifyDeclaredSecretReceipt(
	adapter: 'vite' | 'webpack' | 'bun',
	root: string
): Promise<void> {
	for (const target of ['client', 'server'] as const) {
		for (const [parameter, invocation, rejected] of [
			['T', 'helper(credential)', true],
			['Secret<T>', 'helper(credential)', false],
			['Secret<T>', 'helper.call(null,credential)', false],
			['T', 'helper.call(null,credential)', true],
			['Secret<T>', 'helper.apply(null,[credential])', false],
			['Secret<T>', 'helper.bind(null,credential)', false],
			['Secret<T>', 'Helper.bind(null,credential)', false],
			['T', 'PublicHelper.bind(null,credential)', true],
			['Secret<T>', '((value:string=credential)=>console.log(value))()', true],
			['Secret<T>', '(()=>{let value="";value=credential;console.log(value)})()', true],
			['Secret<T>', '(()=>{let value="";value="public";console.log(value)})()', false]
		] as const) {
			await writeFile(
				path.join(root, 'helper.ts'),
				`import type{Secret}from '@exactjs/secrets';export function helper<T>(value:${parameter}):void{void value;}`
			);
			await writeFile(
				path.join(root, 'entry.tsx'),
				`import{TaskContext,type Component}from '@exactjs/core';import type{Secret}from '@exactjs/secrets';import{helper}from './helper.js';declare const credential:Secret<string>;declare class Helper{constructor(value:Secret<string>)}declare class PublicHelper{constructor(value:string)}export function Page(this:Component<{label:string}>){const run=(_task:TaskContext=TaskContext.server())=>{void ${invocation};};return()=> <button onClick={()=>run()}>{this.state.label}</button>;}`
			);
			let failure: unknown;
			try {
				await build(adapter, root, target);
			} catch (error) {
				failure = error;
			}
			if (rejected) {
				assert.ok(failure, `${adapter}/${target} accepted inferred secret authority`);
				assert.ok(String(failure).includes('EXACT3003'), String(failure));
			} else assert.equal(failure, undefined, `${adapter}/${target}/${invocation}`);
		}
	}
}
