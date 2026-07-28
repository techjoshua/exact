import { createServer as createHttpServer } from 'node:http';
import { spawn } from 'node:child_process';
import { createServer as createViteServer } from 'vite';

const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'custom' });
const port = readPort(process.env.PORT);
let generating = false;
let queued = false;

async function regenerate() {
	if (generating) {
		queued = true;
		return;
	}
	generating = true;
	await new Promise((resolve, reject) => {
		const child = spawn(process.execPath, ['scripts/generate-artifacts.mjs'], {
			stdio: 'inherit',
			cwd: process.cwd()
		});
		child.once('exit', (code) =>
			code === 0 ? resolve() : reject(new Error(`artifact generation exited ${code}`))
		);
	});
	generating = false;
	vite.moduleGraph.invalidateAll();
	vite.ws.send({ type: 'full-reload' });
	if (queued) {
		queued = false;
		await regenerate();
	}
}

vite.watcher.on('change', (file) => {
	if (file.endsWith('App.tsx')) void regenerate();
});

const server = createHttpServer((request, response) => {
	vite.middlewares(request, response, async () => {
		try {
			const module = await vite.ssrLoadModule('/src/server-app.ts');
			await module.handleParcelLabRequest(request, response, {
				clientScript: '/src/client.ts',
				stylesheet: '/src/styles.css',
				transformHtml: (html) => vite.transformIndexHtml(request.url ?? '/', html)
			});
		} catch (error) {
			vite.ssrFixStacktrace(error);
			response.statusCode = 500;
			response.end(error instanceof Error ? error.stack : String(error));
		}
	});
});

server.listen(port, '0.0.0.0', () => console.log(`Parcel Lab running at http://localhost:${port}`));
process.on('message', (message) => {
	if (message?.type === 'exact-acceptance-close') void close();
});

let closing;
function close() {
	return (closing ??= new Promise((resolve, reject) => {
		server.close((error) => (error ? reject(error) : resolve()));
	})
		.then(() => vite.close())
		.then(() => process.exit(0)));
}

function readPort(value) {
	if (value === undefined || value === '') return 4175;
	const port = Number(value);
	if (!Number.isInteger(port) || port < 1 || port > 65_535) {
		throw new Error(
			`PORT must be an integer from 1 through 65535, received ${JSON.stringify(value)}`
		);
	}
	return port;
}
