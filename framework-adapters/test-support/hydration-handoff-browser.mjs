import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
const root = process.cwd();
const { entries, evidence, modes } = JSON.parse(process.argv[2]);
const html = await readFile(path.join(root, 'ssr.html'), 'utf8');
const journey = await readFile(path.join(root, 'journey.mjs'), 'utf8');
const script = entries.client.endsWith('.cjs')
	? '<script>window.module={exports:{}};</script><script src="/' +
		entries.client.slice(2) +
		'"></script>'
	: '';
const loader = entries.client.endsWith('.cjs')
	? 'window.module.exports'
	: 'await import(' + JSON.stringify('/' + entries.client.slice(2)) + ')';
const document =
	'<!doctype html><body>' +
	script +
	'<script type="module">' +
	journey +
	'\nconst imported=' +
	loader +
	';const api=imported.mountPage?imported:imported.default;try{await verifyHydrationHandoff(api.mountPage,' +
	JSON.stringify(html).replaceAll('<', '\\u003c') +
	',async(mode,value)=>{await fetch("/capture/"+mode,{method:"POST",body:JSON.stringify(value)});},' +
	JSON.stringify(modes) +
	');window.handoffDone=true;}catch(error){window.handoffFailure=String(error.stack??error);}</script>';
let sequence = 0;
const server = createServer(async (req, res) => {
	try {
		let body,
			type = 'text/javascript';
		if (req.method === 'POST') {
			const parts = [];
			for await (const chunk of req) parts.push(chunk);
			if (evidence)
				await writeFile(
					path.join(evidence, req.url.split('/').pop() + '.json'),
					Buffer.concat(parts)
				);
			body = 'saved';
			type = 'text/plain';
		} else if (req.url === '/') {
			body = document;
			type = 'text/html';
		} else {
			const filename = path.join(root, new URL(req.url, 'http://localhost').pathname);
			if (!filename.startsWith(root + path.sep)) throw new Error('Invalid test path');
			body = await readFile(filename);
		}
		if (evidence && req.method === 'GET') {
			const id = String(++sequence).padStart(3, '0');
			await writeFile(path.join(evidence, id + '-response.bin'), body);
			await writeFile(
				path.join(evidence, id + '-request.json'),
				JSON.stringify({ url: req.url, type, status: 200 })
			);
		}
		res.writeHead(200, { 'content-type': type });
		res.end(body);
	} catch (error) {
		res.writeHead(500);
		res.end(String(error));
	}
});
let browser;
try {
	await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
	browser = await chromium.launch();
	const page = await browser.newPage();
	const errors = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await page.goto('http://127.0.0.1:' + server.address().port + '/');
	try {
		await page.waitForFunction(() => window.handoffDone || window.handoffFailure);
	} catch (error) {
		throw new Error(errors.join('\n') || String(error));
	}
	const failure = await page.evaluate(() => window.handoffFailure);
	if (failure || errors.length) throw new Error(failure ?? errors.join('\n'));
} finally {
	await browser?.close();
	server.closeAllConnections();
	await new Promise((resolve) => server.close(resolve));
}
