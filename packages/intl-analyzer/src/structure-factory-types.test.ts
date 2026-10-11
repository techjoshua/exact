import path from 'node:path';
import { expect, it, onTestFinished } from 'vitest';
import { NativeCompilerProcess, resolveNativeCompilerExecutable } from '@exactjs/compiler';
import { NativeIntlAnalyzer } from './native-analysis.js';

it.each(['client', 'server'] as const)(
	'preserves strict parameter types for translated structures in the %s artifact',
	(target) => {
		const analyzer = new NativeIntlAnalyzer();
		onTestFinished(() => analyzer.dispose());
		const compiler = new NativeCompilerProcess({ executable: resolveNativeCompilerExecutable() });
		onTestFinished(() => compiler.dispose());
		const filename = path.resolve('.tmp/intl-structure-factory-types.tsx');
		const source = `import * as intl from '@exactjs/intl/enhancements' with {type:'exact-enhancement'};
import * as time from '@exactjs/time/enhancements' with {type:'exact-enhancement'};
export function Page(){return()=> <p intl:message><time time:update>{Math.floor(Date.now()/1000)}</time><em>elapsed</em><strong>ready</strong></p>}`;
		const analyzed = analyzer.analyzeSource(source, {
			filename,
			owner: 'fixture',
			sourceLocale: 'en-US'
		});
		expect(analyzed.diagnostics).toEqual([]);
		const compiled = compiler.request({
			kind: 'compile',
			id: filename,
			source: analyzed.code,
			target,
			root: process.cwd(),
			diagnostics: 'semantic'
		});
		expect(compiled.error).toBeUndefined();
		expect(compiled.diagnostics).toEqual([]);
		expect(compiled.code).toContain('createTimeActivation');
	}
);
