/**
 * @vitest-environment jsdom
 */
import * as exactCore from '@exactjs/core';
import { createVNode } from '@exactjs/core';
import * as exactRenderRuntime from '@exactjs/core/runtime/render';
import * as exactRenderConstructionRuntime from '@exactjs/core/runtime/component-construction/render';
import * as exactReactivityRuntime from '@exactjs/core/runtime/reactivity';
import { render, unmount } from '@exactjs/dom';
import { flushSync } from '@exactjs/reactive';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { transform } from './index.js';

describe('compiled transparent component', () => {
	it('updates its compiler-owned component range without a nested dynamic marker', () => {
		const source = `
			export function Transparent(props: { value: string }) {
				return () => props.value;
			}
		`;
		const compiled = transform(source, {
			filename: 'Transparent.tsx',
			target: 'client'
		});
		expect(compiled).toContain('abi: 32');
		expect(compiled).not.toContain('createDynamicChild');
		expect(compiled).not.toContain('createCompiledComponentOutput');

		const Transparent = executeCompiledComponent(compiled, 'Transparent');
		const container = document.createElement('div');
		render(createVNode(Transparent, { value: 'before' }), container);
		expect(container.textContent).toBe('before');
		expect(container.innerHTML).not.toContain('exact:dynamic');

		render(createVNode(Transparent, { value: 'after' }), container);
		flushSync();
		expect(container.textContent).toBe('after');
		expect(container.innerHTML).not.toContain('exact:dynamic');
		unmount(container);
	});
});

function executeCompiledComponent(
	compiled: string,
	exportName: string
): exactCore.AnyComponentFunction {
	const javascript = ts.transpileModule(compiled, {
		compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
	}).outputText;
	const module = { exports: {} as Record<string, exactCore.AnyComponentFunction> };
	const modules: Record<string, unknown> = {
		'@exactjs/core/runtime/component-construction/render': exactRenderConstructionRuntime,
		'@exactjs/core/runtime/render': exactRenderRuntime,
		'@exactjs/core/runtime/reactivity': exactReactivityRuntime
	};
	new Function('require', 'exports', 'module', javascript)(
		(specifier: string) => {
			if (specifier in modules) return modules[specifier];
			throw new Error(`Unexpected compiled test dependency ${specifier}`);
		},
		module.exports,
		module
	);
	const component = module.exports[exportName];
	if (!component) throw new Error(`Compiled fixture did not export ${exportName}`);
	return component;
}
