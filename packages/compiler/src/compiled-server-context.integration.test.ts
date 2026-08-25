import * as exactCore from '@exactjs/core';
import * as exactServerRenderStructure from '@exactjs/core/framework/server-render-structure';
import * as exactDirectServerConstructionRuntime from '@exactjs/core/runtime/component-construction/direct-server';
import { createVNode, type AnyComponentFunction } from '@exactjs/core';
import { renderToStringAsync } from '@exactjs/ssr';
import * as exactDirectContextFrameRuntime from '@exactjs/ssr/runtime/direct-context-frame';
import ts from 'typescript';
import { expect, it } from 'vitest';
import { transform } from './index.js';

it('renders compiled context providers and consumers through direct server frames', async () => {
	const compiled = transform(
		`
			import { createContext, type Component } from '@exactjs/core';
			const Message = createContext<string>('message', { scope: 'request' });
			function Consumer(this: Component<{}>) {
				return () => <strong>{this.getContext(Message)}</strong>;
			}
			function Provider(this: Component<{}>, props: { children?: unknown }) {
				this.setContext(Message, 'direct');
				return () => <section>{props.children}</section>;
			}
			function Wrapper(props: { children?: unknown }) {
				return () => <div>{props.children}</div>;
			}
			export function Page() {
				return () => <Provider><Wrapper><Consumer /></Wrapper></Provider>;
			}
		`,
		{
			filename: 'CompiledServerContext.tsx',
			target: 'server',
			serverComponents: true
		}
	);
	expect(compiled).not.toContain('@exactjs/ssr/runtime/generic-components');
	expect(compiled).not.toContain('@exactjs/core/runtime/contexts');
	expect(compiled).toContain('@exactjs/ssr/runtime/direct-context-frame');
	expect(compiled.match(/lane: "direct"/g)).toHaveLength(4);
	expect(compiled.match(/frame: __exactDirectSsrContextFrame/g)).toHaveLength(2);

	const javascript = ts.transpileModule(compiled, {
		compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
	}).outputText;
	const module = { exports: {} as { Page?: AnyComponentFunction } };
	const modules: Record<string, unknown> = {
		'@exactjs/core': exactCore,
		'@exactjs/core/framework/server-render-structure': exactServerRenderStructure,
		'@exactjs/core/runtime/component-construction/direct-server':
			exactDirectServerConstructionRuntime,
		'@exactjs/ssr/runtime/direct-context-frame': exactDirectContextFrameRuntime
	};
	new Function('require', 'exports', 'module', javascript)(
		(specifier: string) => {
			if (specifier in modules) return modules[specifier];
			throw new Error(`Unexpected compiled test dependency ${specifier}`);
		},
		module.exports,
		module
	);
	if (!module.exports.Page) throw new Error('Compiled server context fixture omitted Page');

	const result = await renderToStringAsync(createVNode(module.exports.Page, {}), {
		markers: false
	});
	expect(result.html).toContain('<strong>direct</strong>');
	expect(result.html).toMatch(/^<section><div>.*<\/div><\/section>$/);
});
