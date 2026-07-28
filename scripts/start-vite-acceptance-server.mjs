import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const applicationDirectory = path.resolve(process.argv[2]);
const require = createRequire(path.join(applicationDirectory, 'package.json'));
const { createServer } = await import(pathToFileURL(require.resolve('vite')).href);
const port = Number(process.env.PORT);
if (!Number.isInteger(port) || port < 1 || port > 65_535) {
	throw new Error(`Invalid compiler-acceptance port ${JSON.stringify(process.env.PORT)}`);
}

const server = await createServer({
	root: applicationDirectory,
	server: {
		host: '127.0.0.1',
		port,
		strictPort: true
	}
});
await server.listen();
console.log(`Acceptance Vite server running at http://127.0.0.1:${port}`);

process.on('message', (message) => {
	if (message?.type === 'exact-acceptance-close') {
		void server.close().then(() => process.exit(0));
	}
});
