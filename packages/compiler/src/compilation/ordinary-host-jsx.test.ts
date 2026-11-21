/** @vitest-environment node */
import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { expect, it, onTestFinished } from 'vitest';
import { jsx, jsxs, jsxDEV, createElement, Fragment } from '@exactjs/jsx/jsx-runtime';
import type { AnyStateAuthoredComponentFunction } from '@exactjs/core';
import {
	componentInputRecipe,
	redeemComponentInput,
	type ExactComponentInputProvider
} from '@exactjs/core/runtime/component-operations';
import { renderToString } from '@exactjs/ssr';
import { ExactCompilerSession } from '../expression/project.js';
import { createCompilerTestWorkspace, writeTestFiles } from '../test-support/workspace.js';
import { importArtifact } from '../test-support/import-artifact.js';
import { transpileExactWebpackResult } from '../../../../framework-adapters/webpack-plugin/src/loader-transpilation.js';
import { componentContractVersion } from '../native/contract-versions.js';
function readInputs<T extends 'client' | 'server'>(
	operation: unknown,
	provider: ExactComponentInputProvider<T>
) {
	return componentInputRecipe(redeemComponentInput(operation, provider), provider);
}

it('preserves compiled component host JSX inputs, rejection boundaries and public SSR', async () => {
	const root = await createCompilerTestWorkspace('.exact-host-jsx-', process.cwd());
	const source = `import {renderToString} from '@exactjs/ssr';import type {Child} from '@exactjs/core';
 export function Page(props:{label:string,children?:Child}){return()=> <section>{props.label}{props.children}</section>}
 export function localHtml(){return renderToString(<Page label="host"/>)}
 export function spreadHtml(props:{label:string}){return renderToString(<Page {...props}/>)}
 export function otherRenderer(renderToString:(value:unknown)=>unknown){return renderToString(<Page label="ordinary"/>)}`;
	await writeTestFiles(root, {
		'page.tsx': source,
		'tsconfig.json': JSON.stringify({
			compilerOptions: {
				target: 'ES2022',
				module: 'ESNext',
				moduleResolution: 'Bundler',
				jsx: 'preserve',
				strict: true,
				skipLibCheck: true
			},
			files: ['page.tsx']
		})
	});
	const session = new ExactCompilerSession();
	onTestFinished(() => session.dispose());
	const modules: Record<string, Record<string, unknown>> = {};
	for (const target of ['client', 'server'] as const) {
		const result = session.compileNative({
			kind: 'compile',
			id: path.join(root, 'page.tsx'),
			source,
			target,
			configFile: path.join(root, 'tsconfig.json'),
			diagnostics: 'syntax'
		});
		expect(result.error).toBeUndefined();
		expect(result.diagnostics).toEqual([]);
		expect(result.code).toBeTruthy();
		if (target === 'server') {
			expect(result.code).toContain('renderCompilerClosedToString as');
			expect(result.code).toMatch(/<Page\s+\{\.\.\.props\}/);
			expect(result.code).toMatch(/<Page\s+label="ordinary"/);
		}
		const input = path.join(root, `page.exact.${target}.tsx`);
		await writeFile(input, result.code!);
		modules[target] = await importArtifact(
			input,
			path.join(root, target + '.mjs'),
			{},
			'production'
		);
		if (target === 'server')
			modules.development = await importArtifact(
				input,
				path.join(root, 'development.mjs'),
				{},
				'development'
			);
	}
	const keys = path.join(root, 'keys.exact.server.tsx');
	await writeFile(
		keys,
		`import {Page} from './page.exact.server.tsx';
 export function beforeSpread(p:any,k:string){return <Page key={k} {...p}/>}
 export function afterSpread(p:any,k:string){return <Page {...p} key={k}/>}
 export function afterSpreadChildren(p:any,k:string,child:any){return <Page {...p} key={k}>{child}</Page>}`
	);
	const keyModule = await importArtifact(keys, path.join(root, 'keys.mjs'), {}, 'production');
	expect(typeof modules.server!.Page).toBe('function');
	expect(typeof modules.client!.Page).toBe('function');
	const Page = modules.server!.Page as AnyStateAuthoredComponentFunction<Record<string, unknown>>;
	const ClientPage = modules.client!.Page as typeof Page;
	const localHtml = modules.server!.localHtml as () => Promise<{
		html: string;
	}>;
	const developmentHtml = modules.development!.localHtml as typeof localHtml;
	const beforeSpread = keyModule.beforeSpread as (props: object, key: string) => unknown;
	const afterSpread = keyModule.afterSpread as typeof beforeSpread;
	const afterSpreadChildren = keyModule.afterSpreadChildren as (
		props: object,
		key: string,
		child: unknown
	) => unknown;

	// Host development props and eager input identity.
	{
		let reads = 0,
			calls = 0;
		const payload = {},
			child = () => ++calls;
		const props = {
			label: 'host',
			payload,
			key: 'spread',
			get children() {
				reads++;
				return [child, 'text'];
			}
		};
		const operation = jsxDEV(
			Page,
			props,
			7,
			true,
			{ fileName: 'helper.tsx', lineNumber: 1, columnNumber: 2 },
			undefined
		);
		const recipe = readInputs(operation, {
			version: componentContractVersion,
			target: 'server'
		});
		expect(reads).toBe(1);
		expect(calls).toBe(0);
		expect(recipe.key).toBe('spread');
		expect(recipe.props.key).toBeUndefined();
		expect(recipe.props.payload).toBe(payload);
		expect(recipe.props.children).toEqual([child, 'text']);
		expect(recipe.props).not.toHaveProperty('__source');
		expect(recipe.props).not.toHaveProperty('__self');
		expect(
			readInputs(jsx(Page, { label: 'plain', key: 'spread' }), {
				version: componentContractVersion,
				target: 'server'
			}).key
		).toBe('spread');
		const html = await renderToString(jsxs(Page, { label: 'left', children: ['middle', 'right'] }));
		expect(html.html).toContain('left');
		expect(html.html).toContain('middle');
		expect(html.html).toContain('right');
	}

	// Uncompiled functions and mismatched targets remain refused.
	{
		let unsupportedCalls = 0;
		const uncompiled = () => {
			unsupportedCalls++;
			return 'uncompiled';
		};
		for (const type of ['p', Fragment, uncompiled]) {
			for (const invoke of [
				() => jsx(type as never, null),
				() => jsxs(type as never, null),
				() => jsxDEV(type as never, null, undefined, false, undefined, undefined),
				() => createElement(type as never, null)
			])
				expect(invoke).toThrow();
		}
		expect(unsupportedCalls).toBe(0);
		const client = jsx(ClientPage, { label: 'client' });
		expect(() =>
			redeemComponentInput(client, {
				version: componentContractVersion,
				target: 'client'
			})
		).not.toThrow();
		expect(() =>
			readInputs(client, {
				version: componentContractVersion,
				target: 'server'
			})
		).toThrow();
		expect(() =>
			readInputs(jsx(Page, { label: 'server' }), {
				version: componentContractVersion,
				target: 'client'
			})
		).toThrow();
	}

	// Ordinary helpers use the public SSR consumer in production and development.
	{
		const result = await localHtml();
		expect(result.html).toContain('host');
		expect(result.html).toContain('section');
		const dev = await developmentHtml();
		expect(dev.html).toContain('host');
		expect(dev.html).toContain('section');
	}

	// Host key order preserves getter acquisition and dormant child values.
	{
		const order: string[] = [];
		const payload = {};
		const props = {
			get key() {
				order.push('spread-key');
				return 'spread';
			},
			get payload() {
				order.push('payload');
				return payload;
			},
			children: 'prop-child'
		};
		const key = 'explicit';
		const before = readInputs(beforeSpread(props, key), {
			version: componentContractVersion,
			target: 'server'
		});
		expect(before.key).toBe('spread');
		expect(order).toEqual(['spread-key', 'payload']);
		expect(before.props.payload).toBe(payload);
		order.length = 0;
		const after = readInputs(afterSpread(props, key), {
			version: componentContractVersion,
			target: 'server'
		});
		expect(after.key).toBe('explicit');
		expect(order).toEqual(['spread-key', 'payload']);
		order.length = 0;
		let calls = 0;
		const child = () => ++calls;
		const children = readInputs(afterSpreadChildren(props, key, child), {
			version: componentContractVersion,
			target: 'server'
		});
		expect(children.key).toBe('explicit');
		expect(children.children).toEqual({ kind: 'eager', values: [child] });
		expect(calls).toBe(0);
	}

	// Only native-selected loader output uses the eXact automatic entry.
	{
		const exact = await transpileExactWebpackResult(
			{
				code: 'export const child=<Page label="value"/>;',
				map: null,
				jsxRuntime: 'exact'
			},
			'helper.tsx',
			false
		);
		expect(exact.code).toContain('@exactjs/jsx/jsx-runtime');
		expect(exact.code).not.toContain('React.createElement');
		const host = await transpileExactWebpackResult(
			{ code: 'export const child=<Page label="value"/>;', map: null },
			'host.tsx',
			false
		);
		expect(host.code).toContain('React.createElement');
		expect(host.code).not.toContain('@exactjs/jsx');
		const react = await transpileExactWebpackResult(
			{
				code: 'import React from "react";export const child=<Page/>;',
				map: null
			},
			'react.tsx',
			false
		);
		expect(react.code).toContain('React.createElement');
		expect(react.code).not.toContain('@exactjs/jsx');
	}
});
