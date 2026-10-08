import { createServer } from 'node:http';
import { installDevelopmentProcessLifecycle } from '../../scripts/development-process-lifecycle.mjs';

const minimal = Buffer.from('ok');
const prefix = '<!doctype html><html><head></head><body><main>';
const suffix = '</main></body></html>';
const payload = Buffer.from(prefix + 'x'.repeat(3899 - prefix.length - suffix.length) + suffix);
let requests = 0;
const cpuStart = process.cpuUsage();
const start = performance.now();
const server = createServer((request, response) => {
	if (request.url === '/metrics') {
		const cpu = process.cpuUsage(cpuStart);
		response.setHeader('content-type', 'application/json');
		response.end(
			JSON.stringify({
				elapsedMs: performance.now() - start,
				cpuMs: (cpu.user + cpu.system) / 1000,
				requests
			})
		);
		return;
	}
	requests++;
	const bytes = request.url === '/minimal' ? minimal : payload;
	response.setHeader('content-type', 'text/html');
	if (request.url === '/chunked') {
		response.write(bytes.subarray(0, 1900));
		response.end(bytes.subarray(1900));
	} else {
		response.setHeader('content-length', bytes.length);
		response.end(bytes);
	}
});
const lifecycle = installDevelopmentProcessLifecycle({
	label: 'Load driver calibration server',
	close: async () => {
		server.closeAllConnections();
		await new Promise((resolve) => server.close(resolve));
	}
});
server.once('close', () => lifecycle.dispose());
server.listen(Number(process.env.PORT), '127.0.0.1');
