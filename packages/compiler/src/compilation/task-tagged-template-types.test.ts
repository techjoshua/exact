import path from 'node:path';
import { expect, it, onTestFinished } from 'vitest';
import { NativeCompilerProcess } from '../native/process.js';
import { resolveNativeCompilerExecutable } from '../native/executable.js';

for (const target of ['default', 'client', 'server'] as const) {
	it(`preserves generic and explicit receiver template tag types (${target})`, () => {
		const compiler = new NativeCompilerProcess({ executable: resolveNativeCompilerExecutable() });
		onTestFinished(() => compiler.dispose());
		const source = (bad: boolean) => `import{TaskContext,type Component}from '@exactjs/core';
	type Tag=<T extends number>(this:{prefix:string},strings:TemplateStringsArray,value:T)=>T;
	export function Panel(this:Component<{count:number;trace:string}>){
	 this.state.count=0;this.state.trace='';
	 const tags:{prefix:string;tag:Tag}={prefix:'p',tag(_strings,value){return value;}};
	 const run=(task:TaskContext=TaskContext.client().blocking())=>{
	  const result=tags.tag\`count:\${this.state.count}\`;
	  const typed:${bad ? 'string' : 'number'}=result;
	  this.state.trace=String(typed);
	 };
	 return()=> <button onClick={()=>run()}>{this.state.trace}</button>;
	}`;
		for (const bad of [false, true]) {
			const response = compiler.request({
				kind: target === 'default' ? 'check' : 'compile',
				target: target === 'default' ? undefined : target,
				id: path.resolve('.tmp/tagged-template-types.tsx'),
				root: process.cwd(),
				source: source(bad),
				diagnostics: 'semantic'
			});
			expect(response.error).toBeUndefined();
			if (bad)
				expect(response.diagnostics).toContainEqual(expect.objectContaining({ code: 'TS2322' }));
			else expect(response.diagnostics).toEqual([]);
		}
	});
}
