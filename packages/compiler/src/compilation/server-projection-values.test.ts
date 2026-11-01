import path from 'node:path';
import { expect, it } from 'vitest';
import { createCompiledComponentInputReceipt } from '@exactjs/core/runtime/component-operations';
import type { AnyExactComponentCallable } from '@exactjs/core/framework/component-contracts';
import { renderToHydratableString } from '@exactjs/ssr';
import { compileProjectArtifacts } from '../index.js';
import { createCompilerSession } from '../expression/session.js';
import { importArtifact } from '../test-support/import-artifact.js';
import { createTestWorkspace, writeTestFiles } from '../test-support/workspace.js';
it('retains live projected capture values and setup effects after private helper imports', async () => {
	const root = await createTestWorkspace('.exact-projection-values-', process.cwd());
	const files = await writeTestFiles(root, {
		'page.tsx': `import {TaskContext,type Component} from '@exactjs/core';
export const effects:string[]=[];
export function append(values:number[]){return values.push(2);}
export function Page(this:Component<{values:number[]}>){
 this.state.values=[1];
 const send=async(task:TaskContext=TaskContext.server().blocking())=>{void task;append(this.state.values);};send();
 const visible='server-visible';const box={visible};const clientOnly='client-only-marker';
 function dormant(){console.log(clientOnly);}
 const effect=effects.push('setup');void effect;
 function shown(){return box.visible;}
 return()=> <main onClick={()=>dormant()}>{shown()}</main>;
}`,
		'tsconfig.json': JSON.stringify({
			compilerOptions: {
				target: 'ES2022',
				module: 'ESNext',
				moduleResolution: 'bundler',
				jsx: 'preserve',
				strict: true,
				skipLibCheck: true
			}
		})
	});
	const session = createCompilerSession();
	try {
		const artifacts = await compileProjectArtifacts([files['page.tsx']!], {
			rootDir: root,
			outDir: path.join(root, 'generated'),
			session
		});
		const server = await importArtifact(artifacts[0]!.serverFile, path.join(root, 'server.mjs'));
		const result = await renderToHydratableString(
			createCompiledComponentInputReceipt(server.Page as AnyExactComponentCallable, {})
		);
		expect(result.htmlWithHydration).toContain('server-visible');
		expect(server.effects).toEqual(['setup']);
	} finally {
		session.dispose();
	}
});
