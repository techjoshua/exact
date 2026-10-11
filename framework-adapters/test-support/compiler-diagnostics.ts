import { verifyRecursiveContextContract } from './recursive-context-contract.js';
import { verifyFormSourceContract } from './form-source-contracts.js';
import { verifyCollectionSourceContract } from './collection-source-contracts.js';
import { verifyRegistrySourceContract } from './registry-source-contracts.js';
import { verifyPackageEnhancementSpreads } from './enhancement-package-contract.js';
import { verifyEnhancementSourceContract } from './enhancement-source-contracts.js';
import { buildDiagnosticFixture as build } from './compiler-diagnostic-build.js';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const workspace = fileURLToPath(new URL('../../', import.meta.url));

/** Independent diagnostic boundaries keep adapter failures and execution deadlines local. */
export const compilerDiagnosticContracts = [
	'imported helpers',
	'state patterns',
	'secret aliases',
	'secret receipts',
	'write authority',
	'value policies',
	'collection source ownership',
	'form source ownership',
	'registry keys',
	'registry source ownership',
	'registry mutation ownership',
	'internationalization',
	'public record aliases',
	'time anchors',
	'clock inputs',
	'component owner helpers',
	'enhancement prefixes',
	'enhancement metadata unions',
	'enhancement helper contexts',
	'package enhancement spreads',
	'recursive helper contexts'
] as const;

/** Builds one diagnostic boundary through both targets, including its valid correction. */
export async function verifyCompilerDiagnostics(
	adapter: 'vite' | 'webpack' | 'bun',
	contract: (typeof compilerDiagnosticContracts)[number]
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
		if (contract !== 'imported helpers') {
			const checks = {
				'state patterns': verifyDestructuredStateBuild,
				'secret aliases': verifySecretAliasBuild,
				'secret receipts': verifyDeclaredSecretReceipt,
				'write authority': verifyImportedWriteAuthority,
				'value policies': verifyImportedValuePolicies,
				'collection source ownership': verifyCollectionSourceContract,
				'form source ownership': verifyFormSourceContract,
				'registry keys': verifyRegistryKeyProof,
				'registry source ownership': (adapter: 'vite' | 'webpack' | 'bun', root: string) =>
					verifyRegistrySourceContract(adapter, root, 'registry source ownership'),
				'registry mutation ownership': (adapter: 'vite' | 'webpack' | 'bun', root: string) =>
					verifyRegistrySourceContract(adapter, root, 'registry mutation ownership'),
				internationalization: verifyIntlSourceUnit,
				'public record aliases': verifyPublicRecordAlias,
				'time anchors': verifyTimeAnchorAliases,
				'clock inputs': verifyTimeClockInputs,
				'component owner helpers': verifyComponentOwnerHelper,
				'enhancement prefixes': (adapter: 'vite' | 'webpack' | 'bun', root: string) =>
					verifyEnhancementSourceContract(adapter, root, 'enhancement prefixes'),
				'enhancement metadata unions': (adapter: 'vite' | 'webpack' | 'bun', root: string) =>
					verifyEnhancementSourceContract(adapter, root, 'enhancement metadata unions'),
				'enhancement helper contexts': (adapter: 'vite' | 'webpack' | 'bun', root: string) =>
					verifyEnhancementSourceContract(adapter, root, 'enhancement helper contexts'),
				'package enhancement spreads': verifyPackageEnhancementSpreads,
				'recursive helper contexts': verifyRecursiveContextContract
			};
			await checks[contract](adapter, root);
			return;
		}

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
	} finally {
		await rm(root, { recursive: true, force: true });
	}
}

/** Imported helper effects must prove finite remote writes through each adapter's resolver. */
async function verifyImportedWriteAuthority(adapter: 'vite' | 'webpack' | 'bun', root: string) {
	for (const target of ['client', 'server'] as const) {
		for (const [body, invocation, rejected] of [
			["value.label='changed';", 'mutate(this.state.record,key)', false],
			["value[key]='changed';", 'mutate(this.state.record,key)', true],
			["value.label='changed';", 'mutate(this.state.record,"label")', false]
		] as const) {
			await writeFile(
				path.join(root, 'helper.ts'),
				`export function mutate(value:Record<string,string>,key:string){${body}}`
			);
			await writeFile(
				path.join(root, 'entry.tsx'),
				`import {TaskContext,type Component} from '@exactjs/core';import {mutate} from './helper.js';
export function Page(this:Component<{record:Record<string,string>}>){this.state.record={label:'initial'};
 const run=(key:string,_task:TaskContext=TaskContext.server())=>{${invocation};};
 return()=> <button onClick={()=>run('label')}>{this.state.record.label}</button>;}`
			);
			let failure: unknown;
			try {
				await build(adapter, root, target);
			} catch (error) {
				failure = error;
			}
			if (rejected) {
				assert.ok(failure, `${adapter}/${target} granted dynamic imported write authority`);
				assert.ok(String(failure).includes('EXACT2001'), String(failure));
			} else
				assert.equal(failure, undefined, `${adapter}/${target} rejected finite imported writes`);
		}
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

/** Imported annotations constrain actual client reads while type queries remain erased. */
async function verifyImportedValuePolicies(adapter: 'vite' | 'webpack' | 'bun', root: string) {
	for (const target of ['client', 'server'] as const)
		for (const policy of ['server', 'secret'])
			for (const runtime of [false, true]) {
				await writeFile(
					path.join(root, 'helper.ts'),
					`/** @exact keep=${policy} */ export const credential='configured';export const label='public';`
				);
				await writeFile(
					path.join(root, 'entry.tsx'),
					`import {TaskContext} from '@exactjs/core';import {credential,label} from './helper.js';
export function Page(){const run=(_task:TaskContext=TaskContext.client())=>{type Credential=typeof credential;void ${runtime ? 'credential' : 'label'};};return()=> <button onClick={()=>run()}>Ready</button>;}`
				);
				let failure: unknown;
				try {
					await build(adapter, root, target);
				} catch (error) {
					failure = error;
				}
				if (runtime) {
					assert.ok(failure, `${adapter}/${target} accepted a ${policy} client read`);
					assert.ok(String(failure).includes('server-kept'), String(failure));
				} else
					assert.equal(
						failure,
						undefined,
						`${adapter}/${target} rejected an erased ${policy} type query or public sibling`
					);
			}
}

/** Registry key proof must survive adapter resolution without module-wide type-text shortcuts. */
async function verifyRegistryKeyProof(adapter: 'vite' | 'webpack' | 'bun', root: string) {
	for (const target of ['client', 'server'] as const) {
		for (const valid of [false, true]) {
			await writeFile(
				path.join(root, 'entry.tsx'),
				`import {createComponentRegistry,type KeyOf} from '@exactjs/core';
function Grid(){return()=> <p>grid</p>;}const Views=createComponentRegistry(()=>({grid:Grid}));type Unused=KeyOf<typeof Views>;
export function Page(props:{key:${valid ? "'grid'" : 'string'}}){const Current=Views[props.key];return()=> <Current/>;}`
			);
			let failure: unknown;
			try {
				await build(adapter, root, target);
			} catch (error) {
				failure = error;
			}
			if (valid)
				assert.equal(failure, undefined, `${adapter}/${target} rejected a finite registry key`);
			else {
				assert.ok(failure, `${adapter}/${target} accepted an untrusted registry key`);
				assert.ok(String(failure).includes('EXACT_COMPONENT_REGISTRY'), String(failure));
			}
		}
	}
}

/** Locale extraction must reject invalid source metadata and preserve an ordinary helper call. */
async function verifyIntlSourceUnit(adapter: 'vite' | 'webpack' | 'bun', root: string) {
	for (const target of ['client', 'server'] as const) {
		await writeFile(
			path.join(root, 'entry.tsx'),
			`export function Page(props:{value:number}){return()=> <output intl:unit="distance-road" intl:source-unit="kilogram">{props.value}</output>;}`
		);
		const warnings = await build(adapter, root, target, true);
		assert.ok(
			warnings.some((message) => message.includes('recognizable source unit')),
			`${adapter}/${target} lost the invalid source-unit warning: ${warnings.join('\n')}`
		);
		await writeFile(
			path.join(root, 'entry.tsx'),
			`/** @exact pure */
function age(duration:{days:number;hours:number}){const units=[{value:duration.days,unit:'day'},{value:duration.hours,unit:'hour'}] as const;const match=units.find(candidate=>candidate.value>5);if(!match)return 'just now';return new Intl.RelativeTimeFormat('en-US').format(Math.abs(match.value),match.unit);}
export function Page(props:{duration:{days:number;hours:number}}){return()=> <p intl:message>Posted {age(props.duration)}</p>;}`
		);
		await build(adapter, root, target, true);
		for (const [options, valid] of [
			["{['value']:props.value}", true],
			['{value:props.other,value:props.value}', true],
			['{...props.options,value:props.value}', true],
			['{value:props.value,...props.options}', false],
			['{value:props.value,[props.key]:props.other}', false]
		] as const) {
			await writeFile(
				path.join(root, 'entry.tsx'),
				`export function Page(props:{value:number;other:number;options:object;key:string}){return()=> <p intl:message><span intl:plural={${options}}>{props.value===1?'one':'many'}</span></p>;}`
			);
			const warnings = await build(adapter, root, target, true);
			assert.equal(
				warnings.some((message) => message.includes('compiler cannot extract')),
				!valid,
				`${adapter}/${target} lost final selector ownership: ${options}: ${warnings.join('\n')}`
			);
		}
	}
}

/** Public field aliases must remain selectable while secret leaves retain disclosure rejection. */
async function verifyPublicRecordAlias(adapter: 'vite' | 'webpack' | 'bun', root: string) {
	await writeFile(
		path.join(root, 'helper.ts'),
		`import type {Secret} from '@exactjs/secrets';
/** @exact pure */ export function record(){return {get credential():Secret<string>{throw new Error('server only');},label:'public'};}`
	);
	for (const target of ['client', 'server'] as const)
		for (const expression of ['alias.label', 'label', 'computedLabel', 'alias.credential']) {
			await writeFile(
				path.join(root, 'entry.tsx'),
				`import {record} from './helper.js';export function Page(){const service=record();const alias=service;const {label,['label']:computedLabel}=alias;return()=> <p>{${expression}}</p>;}`
			);
			let failure: unknown;
			try {
				await build(adapter, root, target);
			} catch (error) {
				failure = error;
			}
			if (expression === 'alias.credential') {
				assert.ok(failure, `${adapter}/${target} disclosed a secret leaf`);
				assert.ok(String(failure).includes('EXACT3020'), String(failure));
			} else
				assert.equal(
					failure,
					undefined,
					`${adapter}/${target} rejected public alias ${expression}`
				);
		}
}

/** Time plan inputs must survive component-local alias lowering in every adapter's concrete targets. */
async function verifyTimeAnchorAliases(adapter: 'vite' | 'webpack' | 'bun', root: string) {
	for (const target of ['client', 'server'] as const)
		for (const declarations of [
			'const anchor=props.anchor;',
			'const original=props.anchor;const anchor=original;',
			'const {anchor}=props;'
		]) {
			await writeFile(
				path.join(root, 'entry.tsx'),
				`import * as time from '@exactjs/time/enhancements' with {type:'exact-enhancement'};export function Page(props:{anchor:number}){${declarations}const attributes={"time:update":"millisecond" as const,"data-clock":Math.floor((Date.now()-anchor)/1000)};return()=> <_><time data-clock-range data-clock={Math.floor((Date.now()-anchor)/1000)} className="clock" className:elapsed={Math.floor((Date.now()-anchor)/1000)>1} time:update>{Math.floor((Date.now()-anchor)/1000)}</time><time {...{"data-clock":Math.floor((Date.now()-anchor)/1000)}} time:update="millisecond">{Math.floor((Date.now()-anchor)/1000)}</time><time {...attributes}>{Math.floor((Date.now()-anchor)/1000)}</time><time time:update>{Math.floor(Date.now()/1000)}</time></_>;}`
			);
			await build(adapter, root, target);
		}
}

/** Clock projection and helper precision proof must agree across adapter authorization and compilation. */
async function verifyTimeClockInputs(adapter: 'vite' | 'webpack' | 'bun', root: string) {
	for (const target of ['client', 'server'] as const) {
		for (const declaration of [
			'const reading={now:Date.now()};const {now}=reading;',
			'const clockKey="now" as const;const now=Date[clockKey]();',
			'const now=new Date()["getTime"]();',
			'const reading=[Date.now()];const [now]=reading;',
			'const reading={nested:{now:Date.now()}};const {nested:{now}}=reading;'
		]) {
			await writeFile(
				path.join(root, 'entry.tsx'),
				`import * as time from '@exactjs/time/enhancements' with {type:'exact-enhancement'};export function Page(props:{anchor:number}){${declaration}return()=> <time time:update>{Math.floor((now-props.anchor)/1000)}</time>;}`
			);
			await build(adapter, root, target);
		}
		for (const invalid of [
			{ expression: '42', code: 'EXACT_TIME_NO_CLOCK' },
			{
				expression: '(()=>{const Date={now:()=>42};return Date.now()})()',
				code: 'EXACT_TIME_NO_CLOCK'
			},
			{
				expression: '(()=>{const __intlFake=42;return __intlFake})()',
				code: 'EXACT_TIME_NO_CLOCK'
			},
			{ expression: 'Date.now()+Math.random()', code: 'EXACT_TIME_UNSAFE' },
			{
				expression: `Temporal.Now.instant().until(props.deadline).round({smallestUnit:'microsecond'})`,
				code: 'EXACT_TIME_PRECISION'
			}
		]) {
			await writeFile(
				path.join(root, 'entry.tsx'),
				`import * as time from '@exactjs/time/enhancements' with {type:'exact-enhancement'};export function Page(props:{deadline:Temporal.Instant}){return()=> <time time:update>{${invalid.expression}}</time>;}`
			);
			let failure: unknown;
			try {
				await build(adapter, root, target);
			} catch (error) {
				failure = error;
			}
			assert.ok(failure, `${adapter}/${target} accepted invalid clock input`);
			assert.ok(String(failure).includes(invalid.code), String(failure));
		}
		for (const argument of ['Date.now()', 'Date.now()-500', 'Date.now()*2'])
			for (const explicit of [false, true]) {
				await writeFile(
					path.join(root, 'entry.tsx'),
					`import * as time from '@exactjs/time/enhancements' with {type:'exact-enhancement'};export function Page(props:{anchor:number}){function elapsed(now:number,anchor:number){return Math.floor((now-anchor)/1000);}return()=> <time time:update${explicit ? '="millisecond"' : ''}>{elapsed(${argument},props.anchor)}</time>;}`
				);
				let failure: unknown;
				try {
					await build(adapter, root, target);
				} catch (error) {
					failure = error;
				}
				if (!explicit && argument !== 'Date.now()') {
					assert.ok(failure, `${adapter}/${target} inferred incorrect helper clock units`);
					assert.ok(String(failure).includes('EXACT_TIME_AUTO'), String(failure));
				} else
					assert.equal(
						failure,
						undefined,
						`${adapter}/${target} rejected ${argument} explicit=${explicit}`
					);
			}
	}
}

/** Ordinary imported owner parameters must remain callable in both target builds. */
async function verifyComponentOwnerHelper(adapter: 'vite' | 'webpack' | 'bun', root: string) {
	await writeFile(
		path.join(root, 'helper.ts'),
		`import {createContext,type Component} from '@exactjs/core';export const Scope=createContext<string>('diagnostic.helper-scope',{reactive:false});export function read(owner:Component<{}>):string {const receiver=owner;return (()=>leaf(receiver))();}function leaf(owner:Component<{}>):string{return owner.getContext(Scope);}`
	);
	await writeFile(
		path.join(root, 'entry.tsx'),
		`import type {Component} from '@exactjs/core';import {Scope,read} from './helper.js';export function Page(this:Component<{}>){this.setContext(Scope,'helper');return()=> <p>{read(this)}</p>;}`
	);
	for (const target of ['client', 'server'] as const) await build(adapter, root, target);
}
