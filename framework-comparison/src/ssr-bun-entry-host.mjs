/**
 * Instruments the single listener created by a generated production Bun entry point.
 * Keeps its native adapter, fetch callback, and server options. The temporary serve hook
 * exists only during import in this isolated worker and is restored even if startup fails.
 */
export async function startBunEntryHost(options) {
	const bun = globalThis.Bun;
	if (!bun?.serve) throw new Error('Native entry hosting requires Bun.serve');
	const serve = bun.serve;
	let server;
	try {
		bun.serve = function (config) {
			if (server) throw new Error('A benchmark entry must own exactly one listener');
			if (config.routes || typeof config.fetch !== 'function')
				throw new Error('A benchmark entry must expose its complete workload through fetch');
			options.installFetchHandler((request, listener) =>
				config.fetch.call(listener, request, listener)
			);
			server = serve.call(bun, {
				...config,
				hostname: '127.0.0.1',
				port: options.port,
				fetch(request, listener) {
					return new URL(request.url).pathname.startsWith('/__exact-benchmark/')
						? options.handleFetchControl(request)
						: options.handleFetchRequest(request, listener);
				}
			});
			return server;
		};
		await options.loadEntry();
		if (!server) throw new Error('The production Bun entry did not create a listener');
		return {
			port: Number(server.port),
			close: () => server.stop(),
			forceClose: () => server.stop(true)
		};
	} catch (error) {
		await server?.stop(true);
		throw error;
	} finally {
		bun.serve = serve;
	}
}
