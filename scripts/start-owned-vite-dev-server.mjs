import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { installDevelopmentProcessLifecycle } from './development-process-lifecycle.mjs';

/** Parses the intentionally narrow Vite development options used by repository applications. */
export function parseOwnedViteArguments(arguments_, launchDirectory = process.cwd()) {
	const options = { launchDirectory: path.resolve(launchDirectory) };
	for (let index = 0; index < arguments_.length; index++) {
		const argument = arguments_[index];
		if (argument === '--strict-port') options.strictPort = true;
		else if (['--root', '--config', '--host', '--port'].includes(argument)) {
			const value = arguments_[++index];
			if (!value) throw new Error(`${argument} requires a value`);
			if (argument === '--root') options.root = path.resolve(launchDirectory, value);
			else if (argument === '--config') options.configFile = path.resolve(launchDirectory, value);
			else if (argument === '--host') options.host = value;
			else options.port = readPort(value);
		} else throw new Error(`Unsupported owned Vite option ${JSON.stringify(argument)}`);
	}
	return Object.freeze(options);
}

/** Starts Vite in-process so shutdown owns its watchers, sockets, and compiler plugin resources. */
export async function startOwnedViteDevServer(options) {
	const root = options.root ?? options.launchDirectory;
	const require = createRequire(path.join(root, 'package.json'));
	const { createServer } = await import(pathToFileURL(require.resolve('vite')).href);
	const serverOptions = {
		...(options.host === undefined ? {} : { host: options.host }),
		...(options.port === undefined ? {} : { port: options.port }),
		...(options.strictPort === undefined ? {} : { strictPort: options.strictPort })
	};
	const server = await createServer({
		root,
		...(options.configFile ? { configFile: options.configFile } : {}),
		...(Object.keys(serverOptions).length ? { server: serverOptions } : {})
	});
	const lifecycle = installDevelopmentProcessLifecycle({
		label: `Vite development server for ${root}`,
		close: () => server.close()
	});
	try {
		await server.listen();
		server.printUrls();
	} catch (error) {
		lifecycle.dispose();
		await server.close();
		throw error;
	}
	return Object.freeze({ server, lifecycle });
}

function readPort(value) {
	const port = Number(value);
	if (!Number.isInteger(port) || port < 1 || port > 65_535)
		throw new Error(`Vite port must be an integer from 1 through 65535, received ${value}`);
	return port;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
	await startOwnedViteDevServer(parseOwnedViteArguments(process.argv.slice(2)));
}
