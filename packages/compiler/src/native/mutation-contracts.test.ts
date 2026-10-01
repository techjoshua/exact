import path from 'node:path';
import { expect, it, onTestFinished } from 'vitest';
import { mutationContractCases } from '../test-support/mutation-contract-cases.js';
import { NativeCompilerProcess } from './process.js';
import { resolveNativeCompilerExecutable } from './executable.js';

for (const example of mutationContractCases)
	it(`preserves ${example.name} across checking and executable targets`, () => {
		const compiler = new NativeCompilerProcess({ executable: resolveNativeCompilerExecutable() });
		onTestFinished(() => compiler.dispose());
		for (const target of ['default', 'client', 'server'] as const) {
			const result = compiler.request({
				kind: target === 'default' ? 'check' : 'compile',
				target,
				id: path.resolve('.tmp/mutation-contract-' + example.name + '.tsx'),
				source: example.source,
				root: process.cwd(),
				diagnostics: 'semantic'
			});
			expect(result.error).toBeUndefined();
			expect(result.diagnostics).toEqual([]);
		}
		if ('invalid' in example) {
			for (const target of ['default', 'client', 'server'] as const) {
				const result = compiler.request({
					kind: target === 'default' ? 'check' : 'compile',
					target,
					id: path.resolve('.tmp/mutation-contract-' + example.name + '.tsx'),
					source: example.invalid,
					root: process.cwd(),
					diagnostics: 'semantic'
				});
				expect(result.error).toBeUndefined();
				expect(result.diagnostics.some((diagnostic) => diagnostic.severity === 'error')).toBe(true);
			}
		}
	});
