import path from 'node:path';
import typescript from 'typescript';
import { expect, it } from 'vitest';

it('accepts prepared server artifact exports while preserving their prop constraints', () => {
	const filename = path.resolve('packages/testing/src/test-support/server-artifact-contract.ts');
	const source = `
		import { testServerComponent } from '@exactjs/testing';
		import type { Component } from '@exactjs/core';
		import type { ExactPreparedServerComponentReference } from '@exactjs/core/runtime/component-operations';
		declare const Page: (props: { count: number }) => ExactPreparedServerComponentReference;
		const builder = testServerComponent(Page).props({ count: 1 });
		// @ts-expect-error Prepared artifact props still require count.
		builder.props({});
		// @ts-expect-error Receipt factories do not erase the authored prop type.
		builder.props({ count: 'invalid' });
		async function inspect() {
			const view = await builder.render();
			const count: number = view.component(Page).props().count;
			return count;
		}
		declare function Ordinary(this: Component<{ ready: boolean }>, props: { title: string }): () => string;
		async function ordinary() {
			const view = await testServerComponent(Ordinary).props({ title: 'Ready' }).render();
			const ready: boolean = view.root.state().ready;
			return ready;
		}
		// @ts-expect-error Arbitrary object factories are not component artifacts.
		testServerComponent(() => ({ unrelated: true }));
	`;
	const options: typescript.CompilerOptions = {
		module: typescript.ModuleKind.NodeNext,
		target: typescript.ScriptTarget.ES2022,
		strict: true,
		skipLibCheck: true,
		noEmit: true
	};
	const host = typescript.createCompilerHost(options);
	const readFile = host.readFile.bind(host);
	host.readFile = (name) => (name === filename ? source : readFile(name));
	const fileExists = host.fileExists.bind(host);
	host.fileExists = (name) => name === filename || fileExists(name);
	const program = typescript.createProgram([filename], options, host);
	expect(program.getSemanticDiagnostics(program.getSourceFile(filename)!)).toEqual([]);
});
