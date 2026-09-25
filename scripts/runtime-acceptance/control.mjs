import { createServer } from 'node:http';

/** Owns a real upstream source shared by native runtime journeys. */
export async function createControl() {
	const pending = new Map();
	const released = new Set();
	const control = createServer((request, response) => {
		const url = new URL(request.url, 'http://localhost');
		const id = url.searchParams.get('id');
		if (url.pathname === '/status') {
			response.end(JSON.stringify({ pending: [...pending.keys()] }));
			return;
		}
		if (url.pathname === '/release') {
			released.add(id);
			pending.get(id)?.end('released');
			pending.delete(id);
			response.end('ok');
			return;
		}
		if (url.pathname === '/gate') {
			if (released.has(id)) {
				response.end('released');
				return;
			}
			pending.set(id, response);
			// Repeated source updates exercise host disconnect detection on the next write.
			const tick = setInterval(() => response.write('tick'), 100);
			response.on('close', () => clearInterval(tick));
			response.on('close', () => {
				if (pending.get(id) === response) pending.delete(id);
			});
			return;
		}
		response.writeHead(404).end();
	});

	await new Promise((resolve) => control.listen(0, '127.0.0.1', resolve));
	return {
		origin: 'http://127.0.0.1:' + control.address().port,
		reset() {
			if (pending.size)
				throw new Error(
					'Native runtime left upstream requests pending: ' + [...pending.keys()].join(', ')
				);
			released.clear();
		},
		async close() {
			for (const response of pending.values()) response.destroy();
			control.closeAllConnections();
			await new Promise((resolve) => control.close(resolve));
		}
	};
}
