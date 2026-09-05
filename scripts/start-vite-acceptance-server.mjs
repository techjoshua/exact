import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const applicationDirectory = path.resolve(process.argv[2]);
const mode = process.argv[3];
if ((mode !== undefined && mode !== '--preview') || process.argv.length > 4)
	throw new Error(`Unsupported compiler-acceptance server mode ${JSON.stringify(mode)}`);
const productionPreview = mode === '--preview';
const require = createRequire(path.join(applicationDirectory, 'package.json'));
const { createServer, preview } = await import(pathToFileURL(require.resolve('vite')).href);
const port = Number(process.env.PORT);
if (!Number.isInteger(port) || port < 1 || port > 65_535) {
	throw new Error(`Invalid compiler-acceptance port ${JSON.stringify(process.env.PORT)}`);
}

const server = productionPreview
	? await preview({
			root: applicationDirectory,
			preview: { host: '127.0.0.1', port, strictPort: true }
		})
	: await createServer({
			root: applicationDirectory,
			server: { host: '127.0.0.1', port, strictPort: true }
		});
if (!productionPreview) await server.listen();
console.log(
	`Acceptance Vite ${productionPreview ? 'preview' : 'development'} server running at http://127.0.0.1:${port}`
);

process.on('message', (message) => {
	if (message?.type === 'exact-acceptance-close') {
		void server.close().then(() => process.exit(0));
	}
});
