import path from 'node:path';
import { expect, it } from 'vitest';
import { compileFileArtifacts } from '../index.js';
import { createTestWorkspace, writeTestFiles } from '../test-support/workspace.js';
import { importArtifact } from '../test-support/import-artifact.js';

it('preserves native duration construction before deferred method use in both artifacts', async () => {
	const root = await createTestWorkspace('.exact-duration-construction-', process.cwd());
	const files = await writeTestFiles(root, {
		'tsconfig.json': JSON.stringify({
			compilerOptions: {
				target: 'ESNext',
				module: 'ESNext',
				moduleResolution: 'Bundler',
				lib: ['ESNext', 'DOM'],
				strict: true
			}
		}),
		'page.ts': `const __exactRequireDuration=1;const TypeError=class AuthoredError extends Error{};
export const observations:string[]=[];
export function construct(){const formatter=new Intl.DurationFormat('en-US');observations.push('constructed');return()=>formatter.format({seconds:1});}
export function parts(){return new Intl.DurationFormat('en-US').formatToParts({seconds:1});}
export function options(){return new Intl.DurationFormat('en-US').resolvedOptions();}
export function authored(){return new TypeError();}`
	});
	const compiled = await compileFileArtifacts(files['page.ts']!, {
		rootDir: root,
		outDir: root
	});
	const original = Object.getOwnPropertyDescriptor(Intl, 'DurationFormat');
	try {
		for (const [target, artifact] of [
			['client', compiled.clientFile],
			['server', compiled.serverFile]
		] as const) {
			const loaded = await importArtifact(artifact, path.join(root, `${target}.mjs`));
			Object.defineProperty(Intl, 'DurationFormat', { configurable: true, value: undefined });
			expect(() => (loaded.construct as () => unknown)()).toThrow(TypeError);
			expect(loaded.observations).toEqual([]);
			class DurationFormat {
				format() {
					return 'one second';
				}
				formatToParts() {
					return [{ type: 'literal', value: 'one second' }];
				}
				resolvedOptions() {
					return { locale: 'en-US' };
				}
			}
			Object.defineProperty(Intl, 'DurationFormat', { configurable: true, value: DurationFormat });
			const deferred = (loaded.construct as () => () => string)();
			expect(loaded.observations).toEqual(['constructed']);
			expect(deferred()).toBe('one second');
			expect((loaded.parts as () => unknown)()).toEqual([{ type: 'literal', value: 'one second' }]);
			expect((loaded.options as () => unknown)()).toEqual({ locale: 'en-US' });
		}
	} finally {
		if (original) Object.defineProperty(Intl, 'DurationFormat', original);
		else Reflect.deleteProperty(Intl, 'DurationFormat');
	}
});
