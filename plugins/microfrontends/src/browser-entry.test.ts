import { build } from 'esbuild';
import { expect, it } from 'vitest';

it('bundles the public browser component root without build tooling', async () => {
	const result = await build({
		stdin: {
			contents:
				"export {RemoteComponent,loadExactRemoteModule,registerExactRemoteClientBindings,createExactBindingGateway} from '@exactjs/microfrontends';",
			resolveDir: process.cwd()
		},
		bundle: true,
		platform: 'browser',
		format: 'esm',
		write: false,
		metafile: true,
		logLevel: 'silent'
	});
	expect(result.outputFiles[0]!.text).toContain('RemoteComponent');
	expect(result.outputFiles[0]!.text).toContain('createExactBindingGateway');
	const inputs = Object.keys(result.metafile!.inputs);
	expect(inputs.some((file) => file.includes('/typescript/'))).toBe(false);
	expect(
		inputs.some((file) => /microfrontends\/dist\/(build|rollup|webpack|bun)\.js$/.test(file))
	).toBe(false);
});

it('omits server initialization when only the browser component is retained', async () => {
	const result = await build({
		stdin: {
			contents: "export {RemoteComponent} from '@exactjs/microfrontends';",
			resolveDir: process.cwd()
		},
		bundle: true,
		platform: 'browser',
		format: 'esm',
		write: false,
		metafile: true,
		logLevel: 'silent'
	});
	const serverInputs = Object.values(result.metafile!.outputs)
		.flatMap((output) => Object.entries(output.inputs))
		.filter(
			([file, input]) =>
				file.replaceAll('\\', '/').includes('/server/dist/') && input.bytesInOutput > 0
		);
	expect(serverInputs).toEqual([]);
});
