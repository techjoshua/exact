import assert from 'node:assert/strict';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDiagnosticFixture } from './compiler-diagnostic-build.js';

const workspace = fileURLToPath(new URL('../../', import.meta.url));

/** Rejects the server snapshot demand while admitting the same client-local symbol source.
 * A named property correction builds through both actual adapter targets with ordinary options.
 */
export async function verifySymbolStateContract(
	adapter: 'vite' | 'webpack' | 'bun',
	root: string
): Promise<void> {
	const corpus = path.join(
		workspace,
		'packages/component-composition-corpus/test-support/symbol-state'
	);
	for (const source of ['symbol', 'client-only', 'named'] as const) {
		await writeFile(
			path.join(root, 'entry.tsx'),
			await readFile(path.join(corpus, source + '.tsx'))
		);
		for (const target of ['client', 'server'] as const) {
			let failure: unknown;
			try {
				await buildDiagnosticFixture(adapter, root, target, false, true, false, workspace);
			} catch (error) {
				failure = error;
			}
			if (source === 'symbol' && target === 'server') {
				assert.ok(failure, `${adapter} admitted symbol-keyed SSR snapshot`);
				for (const text of ['EXACT2232', 'Symbol', 'SSR hydration snapshot', 'entry.tsx'])
					assert.ok(String(failure).includes(text), `${adapter} lost ${text}: ${String(failure)}`);
			} else {
				assert.equal(failure, undefined, `${adapter}/${source}/${target}: ${String(failure)}`);
				assert.ok(
					(await readdir(path.join(root, 'out-' + target))).some((name) =>
						/^entry\.(?:js|mjs|cjs)$/.test(name)
					)
				);
			}
		}
	}
}
