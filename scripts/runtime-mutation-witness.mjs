import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { verifyWitness } from './task-mutation-witness.mjs';

/** Proves that observable ordering, cancellation, cleanup and failure checks reject deliberate faults. */
export async function verifyRuntimeMutations(root) {
	const cases = [
		[
			'stale state commit',
			'packages/hydrate/src/runtime/state-ordering.ts',
			'version > ordinal && overlaps(path, previous)',
			'false',
			'packages/hydrate/src/runtime/state-ordering.test.ts',
			'rejects a conflicting response atomically',
			/expected true to be false/
		],
		[
			'lost producer cancellation',
			'packages/core/src/tasks/runtime.ts',
			'record.controller.abort(reason);',
			'void reason;',
			'packages/core/src/tasks/mutation-witness.test.ts',
			'delivers cancellation',
			/expected false to be true/
		],
		[
			'lost owned cleanup',
			'packages/core/src/tasks/frame-settlement.ts',
			'await cleanup();',
			'void cleanup;',
			'packages/core/src/tasks/mutation-witness.test.ts',
			'runs owned cleanup',
			/expected \+?0 to be 1/
		],
		[
			'lost cleanup error',
			'packages/core/src/tasks/frame-settlement.ts',
			'if (primary !== undefined) throw primary;',
			'void primary;',
			'packages/core/src/tasks/mutation-witness.test.ts',
			'reports a cleanup failure',
			/expected undefined to be Error: cleanup failed/
		]
	];
	for (const [name, file, anchor, replacement, test, title, failure] of cases) {
		await verifyWitness(
			root,
			name,
			[test, '-t', title],
			async (temporary) => {
				const config = path.join(temporary, 'vitest.config.mts');
				await writeFile(
					config,
					`import base from ${JSON.stringify(path.join(root, 'vitest.config.ts'))};
export default {...base,plugins:[...base.plugins,{name:'runtime-mutation',enforce:'pre',transform(code,id){
 if(id.replaceAll('\\\\','/').split('?')[0]!==${JSON.stringify(path.join(root, file).replaceAll('\\', '/'))})return;
 const anchor=${JSON.stringify(anchor)};
 if(code.split(anchor).length!==2)throw new Error('Expected one mutation anchor');
 return {code:code.replace(anchor,${JSON.stringify(replacement)}),map:null};
}}]};`
				);
				return { args: ['--config', config] };
			},
			failure
		);
	}
}
