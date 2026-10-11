import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, it, onTestFinished } from 'vitest';
import { createInstalledThemeFixture } from '../../test-support/installed-theme.js';

it.each(['authored', 'paired', 'published', 'library', 'duplicate'] as const)(
	'preserves installed helper enhancements with Bun (%s)',
	async (mode) => {
		for (const availability of [
			'enabled',
			'excluded',
			'absent',
			'library-only',
			'delegated'
		] as const) {
			if (availability === 'absent' && mode === 'authored') continue;
			if ((availability === 'library-only' || availability === 'delegated') && mode !== 'duplicate')
				continue;
			const fixture = await createInstalledThemeFixture(
				mode === 'duplicate' ? 'library' : mode,
				availability,
				mode === 'duplicate'
			);
			onTestFinished(fixture.dispose);
			const runner = path.join(fixture.root, 'build.mjs');
			await writeFile(
				runner,
				`import {exact} from ${JSON.stringify(new URL('../dist/index.js', import.meta.url).href)};
const plugin=exact(${JSON.stringify({ applicationRoot: fixture.root, target: 'server', serverComponents: true, reactCompatibility: false })});
try{const result=await Bun.build({entrypoints:['./run.ts'],outdir:'./bundle',naming:'server.mjs',target:'bun',format:'esm',plugins:[plugin]});if(!result.success)throw new Error(JSON.stringify(result.logs));}finally{await plugin.dispose();}`
			);
			execFileSync('bun', [runner], { cwd: fixture.root, encoding: 'utf8', timeout: 60000 });
			const output = execFileSync('bun', [path.join(fixture.root, 'bundle/server.mjs')], {
				cwd: fixture.root,
				encoding: 'utf8',
				timeout: 10000
			});
			expect(JSON.parse(output)).toEqual({
				scope:
					availability === 'enabled' ||
					availability === 'library-only' ||
					availability === 'delegated',
				field:
					availability === 'enabled' ||
					availability === 'library-only' ||
					availability === 'delegated',
				input: true
			});
		}
	},
	90000
);
