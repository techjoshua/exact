import { describe, expect, it } from 'vitest';
import { createTransformer } from './transformer.js';

describe('@exactjs/jest transformer', () => {
	it('separates cached CommonJS and ESM projections', () => {
		const transformer = createTransformer();
		const source = 'export const value=1;';
		const filename = '/project/src/value.ts';
		expect(transformer.getCacheKey(source, filename, { supportsStaticESM: true })).not.toBe(
			transformer.getCacheKey(source, filename, { supportsStaticESM: false })
		);
		expect(transformer.getCacheKey(source, filename, { configString: 'first' })).not.toBe(
			transformer.getCacheKey(source, filename, { configString: 'second' })
		);
		expect(transformer.getCacheKey(source, filename, { instrument: true })).not.toBe(
			transformer.getCacheKey(source, filename, { instrument: false })
		);
	});
	it('compiles eXact TSX and removes TypeScript syntax', () => {
		const result = createTransformer().process(
			'function View(this: { state: { count: number } }) { return () => <p>{this.state.count}</p>; }',
			'/project/src/View.tsx',
			{ supportsStaticESM: true }
		);

		expect(result.code).toContain('createPreparedRenderProgram');
		expect(result.code).not.toContain('this:');
	});

	it('uses the automatic runtime for runner-owned test modules', () => {
		const result = createTransformer().process(
			'it("renders", () => expect(<p>ok</p>).toBeDefined());',
			'/project/src/View.test.tsx',
			{ supportsStaticESM: true }
		);

		expect(result.code).toContain('@exactjs/jsx/jsx-runtime');
		expect(result.code).not.toContain('createCompiledVNode');
	});

	it('compiles inline components only when test compilation is enabled', () => {
		const transformer = createTransformer();
		const source =
			'function View(this: {state: {count: number}}) { this.state.count = 0; return () => <p>{this.state.count}</p>; } it("mounts", () => View);';
		const filename = '/project/src/View.test.tsx';
		const options = { supportsStaticESM: true, transformerConfig: { compileTestModules: true } };
		const compiled = transformer.process(source, filename, options);
		expect(compiled.code).toContain('createPreparedRenderProgram');
		expect(compiled.code).toContain('it("mounts"');
		expect(transformer.process(source, filename, { supportsStaticESM: true }).code).not.toContain(
			'createPreparedRenderProgram'
		);
		expect(transformer.getCacheKey(source, filename, options)).not.toBe(
			transformer.getCacheKey(source, filename)
		);
	});

	it('lowers direct React component tags when compatibility is configured', () => {
		const result = createTransformer().process(
			`/** @jsxImportSource @exactjs/jsx */
			import { Suspense } from "react";
			function View() { return () => <Suspense fallback="wait" />; }`,
			'/project/src/View.tsx',
			{
				supportsStaticESM: true,
				transformerConfig: { reactCompatibility: { target: 19, cwd: process.cwd() } }
			}
		);

		expect(result.code).toContain('adaptReactComponent');
		expect(result.code).toContain('@exactjs/react-compat/exact');
	});

	it('keeps React-owned test fixtures on the configured React JSX runtime', () => {
		const result = createTransformer().process(
			`import { useState } from "react";
			export function Fixture() {
				const [count] = useState(0);
				return <button>{count}</button>;
			}`,
			'/project/src/Fixture.test.tsx',
			{
				supportsStaticESM: true,
				transformerConfig: { reactCompatibility: { target: 19, cwd: process.cwd() } }
			}
		);

		expect(result.code).toContain('@exactjs/react-compat/jsx-runtime19');
		expect(result.code).not.toContain('@exactjs/jsx/jsx-runtime');
	});

	it('fingerprints regular-expression compatibility configuration', () => {
		const transformer = createTransformer();
		const common = { supportsStaticESM: true } as const;
		const left = transformer.getCacheKey('export {}', '/project/src/value.ts', {
			...common,
			transformerConfig: {
				reactCompatibility: { target: 19, source: /react-source/ }
			}
		});
		const right = transformer.getCacheKey('export {}', '/project/src/value.ts', {
			...common,
			transformerConfig: {
				reactCompatibility: { target: 19, source: /exact-source/ }
			}
		});

		expect(left).not.toBe(right);
	});
});
