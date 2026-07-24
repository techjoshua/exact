import { describe, expect, it } from 'vitest';
import { createTransformer } from './transformer.js';

describe('@exactjs/jest transformer', () => {
	it('compiles eXact TSX and removes TypeScript syntax', () => {
		const result = createTransformer().process(
			'function View(this: { state: { count: number } }) { return () => <p>{this.state.count}</p>; }',
			'/project/src/View.tsx',
			{ supportsStaticESM: true }
		);

		expect(result.code).toContain('createCompiledVNode');
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
});
