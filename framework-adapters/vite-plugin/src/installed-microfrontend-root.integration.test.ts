import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { copyInstalledRuntimePackages } from '../../test-support/installed-runtime-packages.js';

it('selects the isolated installed microfrontend browser root', async () => {
	const root = await mkdtemp(path.join(tmpdir(), 'exact-installed-remote-root-'));
	try {
		await copyInstalledRuntimePackages(root, ['@exactjs/microfrontends']);
		const result = await build({
			stdin: {
				contents:
					"export {RemoteComponent,loadExactRemoteModule,createExactBindingGateway} from '@exactjs/microfrontends';",
				resolveDir: root
			},
			bundle: true,
			platform: 'browser',
			format: 'esm',
			write: false,
			metafile: true,
			logLevel: 'silent'
		});
		expect(result.outputFiles[0]!.text).toContain('createExactBindingGateway');
		const inputs = Object.keys(result.metafile!.inputs).map((file) => path.resolve(file));
		expect(
			inputs
				.filter((file) => file.includes('/@exactjs/'))
				.every((file) => file.startsWith(root + path.sep))
		).toBe(true);
		expect(
			inputs.some((file) => file.endsWith('/microfrontends/dist/client-artifact/browser.js'))
		).toBe(true);
		expect(inputs.some((file) => file.includes('/typescript/'))).toBe(false);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
}, 60000);
