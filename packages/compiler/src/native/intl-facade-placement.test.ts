import path from 'node:path';
import { expect, it, onTestFinished } from 'vitest';
import { NativeCompilerProcess } from './process.js';
import { resolveNativeCompilerExecutable } from './executable.js';

it('keeps framework Intl facade placement portable without trusting application lookalikes', () => {
	const compiler = new NativeCompilerProcess({ executable: resolveNativeCompilerExecutable() });
	onTestFinished(() => compiler.dispose());
	for (const target of ['default', 'client', 'server'] as const)
		for (const shape of ['named', 'renamed', 'namespace', 'alias', 'lookalike'] as const) {
			const imports =
				shape === 'lookalike'
					? 'interface IntlFacade {DateTimeFormat(locale:string):unknown}declare const local:IntlFacade;'
					: shape === 'namespace'
						? "import * as core from '@exactjs/core';"
						: shape === 'named'
							? "import {intl} from '@exactjs/core';"
							: "import {intl as facade} from '@exactjs/core';";
			const receiver =
				shape === 'lookalike'
					? 'local'
					: shape === 'namespace'
						? 'core.intl'
						: shape === 'alias'
							? 'local'
							: shape === 'named'
								? 'intl'
								: 'facade';
			const source = `${imports}export function Page(){${shape === 'alias' ? 'const local=facade;' : ''}${receiver}.DateTimeFormat('en');return()=> <p>ready</p>;}`;
			const result = compiler.request({
				kind: 'analyze',
				id: path.resolve('.tmp/intl-facade-placement.tsx'),
				root: process.cwd(),
				source,
				target
			});
			expect(result.error).toBeUndefined();
			expect(result.analysis!.components[0]!.placement, `${shape}/${target}`).toBe(
				shape === 'lookalike' ? 'unknown' : 'isomorphic'
			);
			expect(result.analysis!.components[0]!.artifactTargets).toEqual(
				shape === 'lookalike' ? [] : ['client', 'server']
			);
		}
});
