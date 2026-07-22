import { execFileSync } from 'node:child_process';
import { createServer as createHttpServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createExactNodeHandler } from '@exact/node-adapter';
import { exact } from '@exact/vite-plugin';
import { createServer as createViteServer } from 'vite';

const sampleRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.env.EXACT_BUILD_KEY = execFileSync('git', ['rev-parse', 'HEAD'], {
	cwd: path.resolve(sampleRoot, '../..'),
	encoding: 'utf8'
}).trim();

const runtimeLoader = await createViteServer({
	root: sampleRoot,
	configFile: false,
	appType: 'custom',
	logLevel: 'error',
	server: { middlewareMode: true }
});
const { createSampleRuntimes } = await runtimeLoader.ssrLoadModule('/server/runtime.ts');
const runtimes = createSampleRuntimes({ buildKey: process.env.EXACT_BUILD_KEY });

const billingAssets = await remoteAssets('billing', 4301);
const brandingAssets = await remoteAssets('branding', 4302);
const pageRoot = path.join(sampleRoot, 'page');
const pageVite = await createViteServer({
	root: pageRoot,
	configFile: false,
	appType: 'spa',
	logLevel: 'info',
	resolve: { alias: sharedAlias() },
	plugins: [exact({ applicationRoot: pageRoot })],
	server: { middlewareMode: true }
});

const pageExact = createExactNodeHandler(runtimes.page);
const page = createHttpServer((request, response) => {
	if (new URL(request.url ?? '/', 'http://localhost').pathname === '/__exact') {
		pageExact(request, response);
		return;
	}
	pageVite.middlewares(request, response, (error) => {
		response.statusCode = error ? 500 : 404;
		response.end(error instanceof Error ? error.stack : 'Not Found');
	});
});
const billing = exactServer(runtimes.billing, 4401);
const branding = exactServer(runtimes.branding, 4402);

await new Promise((resolve) => page.listen(4300, '0.0.0.0', resolve));
console.log('\nTrusted microfrontend portal: http://localhost:4300');
console.log('Browser artifacts: billing :4301, branding :4302');
console.log('Private eXact hosts: billing :4401, branding :4402\n');

const close = async () => {
	await Promise.all([
		closeHttp(page),
		closeHttp(billing),
		closeHttp(branding),
		pageVite.close(),
		billingAssets.close(),
		brandingAssets.close(),
		runtimeLoader.close()
	]);
};
process.once('SIGINT', () => void close().then(() => process.exit(0)));
process.once('SIGTERM', () => void close().then(() => process.exit(0)));

async function remoteAssets(name, port) {
	const applicationRoot = path.join(sampleRoot, name);
	const server = await createViteServer({
		root: applicationRoot,
		configFile: false,
		appType: 'spa',
		logLevel: 'info',
		resolve: { alias: sharedAlias() },
		plugins: [exact({ applicationRoot })],
		server: { port, strictPort: true, cors: true }
	});
	await server.listen();
	return server;
}

function sharedAlias() {
	return {
		'@exact/sample-microfrontend-portal/shared': path.join(sampleRoot, 'src', 'shared.ts')
	};
}

function exactServer(runtime, port) {
	const exactHandler = createExactNodeHandler(runtime);
	const server = createHttpServer((request, response) => {
		if (new URL(request.url ?? '/', 'http://localhost').pathname !== '/__exact') {
			response.statusCode = 404;
			response.end('Not Found');
			return;
		}
		exactHandler(request, response);
	});
	server.listen(port, '127.0.0.1');
	return server;
}

function closeHttp(server) {
	return new Promise((resolve, reject) =>
		server.close((error) => (error ? reject(error) : resolve()))
	);
}
