import path from 'node:path';
import { expect, it, onTestFinished } from 'vitest';
import { NativeCompilerProcess } from './process.js';
import { resolveNativeCompilerExecutable } from './executable.js';

// Framework read contracts must survive ordinary helpers without granting purity to writes or names.
it.each(['read', 'probe', 'write', 'lookalike'] as const)(
	'proves context helper reevaluation: %s',
	(mode) => {
		const compiler = new NativeCompilerProcess({ executable: resolveNativeCompilerExecutable() });
		onTestFinished(() => compiler.dispose());
		const operation =
			mode === 'probe'
				? 'owner.hasContext(scope)'
				: mode === 'write'
					? "owner.setContext(scope,'changed')"
					: 'owner.getContext(scope)';
		const source = `import {createContext,type Component} from '@exactjs/core';const scope=createContext<string>('helper.proof',{reactive:false});
${mode === 'lookalike' ? 'interface Other {getContext(token:unknown):string}declare const other:Other;' : ''}
function read(owner:${mode === 'lookalike' ? 'Other' : 'Component<{}>'}){return ${operation};}
export function Page(this:Component<{}>,props:{suffix:string}){const value=String(read(${mode === 'lookalike' ? 'other' : 'this'}))+props.suffix;return()=> <output>{String(value)}</output>;}`;
		for (const target of ['client', 'server'] as const) {
			const result = compiler.request({
				kind: 'compile',
				id: path.resolve('.tmp/context-helper-proof.tsx'),
				root: process.cwd(),
				source,
				target
			});
			expect(result.error).toBeUndefined();
			const errors = result.diagnostics.filter((d) => d.severity === 'error');
			if (mode === 'write' || mode === 'lookalike')
				expect(errors.some((d) => d.code === 'EXACT2202')).toBe(true);
			else expect(errors).toEqual([]);
		}
	}
);
