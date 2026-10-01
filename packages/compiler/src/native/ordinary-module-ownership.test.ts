import path from 'node:path';
import { expect, it, onTestFinished } from 'vitest';
import { NativeCompilerProcess } from './process.js';
import { resolveNativeCompilerExecutable } from './executable.js';

for (const target of ['client', 'server'] as const)
	it(`preserves host-owned bootstrap effects without weakening component placement (${target})`, () => {
		const compiler = new NativeCompilerProcess({ executable: resolveNativeCompilerExecutable() });
		onTestFinished(() => compiler.dispose());
		const prefix = 'import "@fixture/opaque-bootstrap";';
		const helper =
			prefix +
			'export class Counter extends Array<number>{value=1;increment(){return ++this.value;}make(){return()=>this.increment();}}';
		const options = {
			kind: 'compile' as const,
			target,
			id: path.resolve('.tmp/helper-bootstrap.ts'),
			root: process.cwd(),
			source: helper
		};
		const strict = compiler.request(options);
		expect(strict.diagnostics.some((diagnostic) => diagnostic.code === 'EXACT2101')).toBe(true);
		const application = compiler.request({ ...options, preserveOrdinaryModules: true });
		expect(application.error).toBeUndefined();
		expect(application.diagnostics).toEqual([]);
		expect(application.code).toContain('@fixture/opaque-bootstrap');
		expect(
			application.analysis.callables.some(
				(callable) => callable.kind === 'module-initializer' && callable.effect === 'unknown'
			)
		).toBe(true);
		for (const body of ['return ()=> <output>{this.state.count}</output>;', 'return ()=>null;']) {
			const component = compiler.request({
				...options,
				preserveOrdinaryModules: true,
				source:
					prefix +
					`import type {Component} from '@exactjs/core';export function Probe(this:Component<{count:number}>){this.state.count=0;${body}}`,
				id: path.resolve('.tmp/component-bootstrap.tsx')
			});
			expect(component.diagnostics.some((diagnostic) => diagnostic.code === 'EXACT2101')).toBe(
				true
			);
		}
	});

for (const target of ['client', 'server'] as const)
	it(`retains secret consumption policy in host-owned helpers (${target})`, () => {
		const compiler = new NativeCompilerProcess({ executable: resolveNativeCompilerExecutable() });
		onTestFinished(() => compiler.dispose());
		const source =
			'import {consume} from "@exactjs/secrets";\n/** @exact keep=secret */\nconst apiKey="configured";\nexport const value=consume(apiKey);\nexport function read(){return value;}';
		for (const preserveOrdinaryModules of [false, true]) {
			const result = compiler.request({
				kind: 'compile',
				target,
				id: path.resolve('.tmp/helper-secret.ts'),
				source,
				root: process.cwd(),
				preserveOrdinaryModules
			});
			expect(result.error).toBeUndefined();
			if (target === 'server') expect(result.diagnostics).toEqual([]);
			expect(result.diagnostics.some((diagnostic) => diagnostic.code === 'EXACT3004')).toBe(
				target === 'client'
			);
		}
	});
