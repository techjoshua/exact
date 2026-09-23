import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readdir, readFile, writeFile, mkdir, symlink, rm, cp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/** Tests current unpublished packages from an external project, with process and browser ownership. */
async function main() {
	const { createExactApp } = await import('../packages/create-exact-app/dist/index.js');
	const { chromium } = await import('@playwright/test');
	const workspace = process.cwd();
	const temporary = await mkdtemp(path.join(tmpdir(), 'exact-created-apps-'));
	const browser = await chromium.launch();
	try {
		const serverRoot = path.join(temporary, 'server');
		await createExactApp({
			directory: serverRoot,
			name: 'external-server',
			bundler: 'vite',
			runtime: 'node',
			testRunner: 'vitest',
			skill: false
		});
		await linkDependencies(serverRoot, workspace);
		await writeFile(
			path.join(serverRoot, 'public/robots.txt'),
			'User-agent: *\nDisallow: /private\n'
		);
		const shared = path.join(temporary, 'shared');
		await mkdir(shared);
		await writeFile(
			path.join(shared, 'package.json'),
			JSON.stringify({ name: '@starter/shared', type: 'module', exports: './index.ts' })
		);
		await writeFile(
			path.join(shared, 'index.ts'),
			'export const workspaceMessage: string = "Sibling workspace source";'
		);
		await mkdir(path.join(serverRoot, 'node_modules/@starter'));
		await symlink(
			shared,
			path.join(serverRoot, 'node_modules/@starter/shared'),
			process.platform === 'win32' ? 'junction' : 'dir'
		);
		const serverAppPath = path.join(serverRoot, 'src/App.tsx');
		await writeFile(
			serverAppPath,
			'import {workspaceMessage} from "@starter/shared";\n' +
				(await readFile(serverAppPath, 'utf8')).replace(
					'<h1>eXact</h1>',
					'<h1>eXact</h1><p>{workspaceMessage}</p>'
				)
		);
		const configPath = path.join(serverRoot, 'vite.server.config.ts');
		await writeFile(
			configPath,
			(await readFile(configPath, 'utf8')).replace(
				'defineConfig({',
				'defineConfig({ ssr: { noExternal: ["@starter/shared"] },'
			)
		);

		await run(
			process.execPath,
			[path.join(workspace, 'node_modules/vitest/vitest.mjs'), 'run'],
			serverRoot
		);
		await run(process.execPath, ['scripts/build.mjs'], serverRoot);
		await run(process.execPath, ['scripts/generate.mjs'], serverRoot);
		await run(
			process.execPath,
			[path.join(workspace, 'node_modules/vitest/vitest.mjs'), 'run'],
			serverRoot
		);
		await run(
			process.execPath,
			[
				path.join(workspace, 'packages/compiler/dist/cli.js'),
				'--check',
				'--project',
				'tsconfig.json'
			],
			serverRoot
		);
		for (const command of ['dist/server/server.js', 'scripts/dev.mjs']) {
			await withServer(serverRoot, command, async (origin) => {
				const response = await fetch(origin);
				assert.equal(response.status, 200);
				const html = await response.text();
				assert.match(html, /Rendered on the server/);
				assert.match(html, /<title[^>]*>eXact app<\/title>/);
				assert.match(html, /Count: 0/);
				assert.match(html, /Sibling workspace source/);
				assert.equal((await fetch(origin, { method: 'HEAD' })).status, 200);
				assert.match(
					await (await fetch(new URL('robots.txt', origin))).text(),
					/Disallow: \/private/
				);
				assert.equal((await fetch(new URL('.vite/manifest.json', origin))).status, 404);
				const page = await browser.newPage();
				page.setDefaultTimeout(15000);
				const errors = [];
				page.on('pageerror', (error) => errors.push(error.message));
				page.on('console', (message) => {
					if (message.type() === 'error') errors.push(message.text());
				});
				try {
					await page.goto(origin);
					await page.getByRole('button', { name: 'Count: 0', exact: true }).click();
					await page.getByRole('button', { name: 'Count: 1', exact: true }).waitFor();
					const request = page.waitForResponse((response) => response.url().endsWith('/__exact'));
					await page.getByRole('button', { name: 'Server count: 0', exact: true }).click();
					assert.equal((await request).status(), 200);
					await page.getByRole('button', { name: 'Server count: 1', exact: true }).waitFor();
					assert.deepEqual(errors, []);
				} catch (error) {
					console.error(command, errors, await page.locator('body').innerText());
					throw error;
				} finally {
					await page.close();
				}
			});
		}
		for (const runtime of ['express', 'fastify', 'koa', 'hapi']) {
			const hostRoot = path.join(temporary, runtime);
			await createExactApp({
				directory: hostRoot,
				name: `external-${runtime}`,
				bundler: 'vite',
				runtime,
				testRunner: 'none',
				skill: false
			});
			await linkDependencies(hostRoot, workspace);
			await run(process.execPath, ['scripts/build.mjs'], hostRoot);
			await run(
				process.execPath,
				[
					path.join(workspace, 'packages/compiler/dist/cli.js'),
					'--check',
					'--project',
					'tsconfig.json'
				],
				hostRoot
			);
			await withServer(hostRoot, 'dist/server/server.js', async (origin) => {
				assert.match(await (await fetch(origin)).text(), /Rendered on the server/);
				const page = await browser.newPage();
				page.setDefaultTimeout(15000);
				page.on('pageerror', (error) => console.error(runtime, error.message));
				page.on('console', (message) => {
					if (message.type() === 'error') console.error(runtime, message.text());
				});
				try {
					await page.goto(origin);
					await page.getByRole('button', { name: 'Count: 0', exact: true }).click();
					await page.getByRole('button', { name: 'Count: 1', exact: true }).waitFor();
					await page.getByRole('button', { name: 'Server count: 0', exact: true }).click();
					await page.getByRole('button', { name: 'Server count: 1', exact: true }).waitFor();
				} catch (error) {
					throw new Error(`${runtime}: ${error.message}`, { cause: error });
				} finally {
					await page.close();
				}
			});
		}
		const singleRoot = path.join(temporary, 'single');
		await createExactApp({
			directory: singleRoot,
			name: 'external-single',
			bundler: 'vite',
			runtime: 'browser',
			output: 'single-file',
			testRunner: 'none',
			skill: false
		});
		await linkDependencies(singleRoot, workspace);
		await writeFile(
			path.join(singleRoot, 'src/mark.svg'),
			'<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="red"/></svg>'
		);
		const app = await readFile(path.join(singleRoot, 'src/App.tsx'), 'utf8');
		await writeFile(
			path.join(singleRoot, 'src/App.tsx'),
			'import mark from "./mark.svg";\n' +
				app.replace('<h1>eXact</h1>', '<h1>eXact</h1><img src={mark} alt="Embedded mark" />')
		);
		await run(
			process.execPath,
			[
				path.join(workspace, 'framework-adapters/vite-plugin/node_modules/vite/bin/vite.js'),
				'build'
			],
			singleRoot
		);
		assert.deepEqual(await readdir(path.join(singleRoot, 'dist')), ['index.html']);
		const context = await browser.newContext({ offline: true });
		try {
			const page = await context.newPage();
			page.setDefaultTimeout(15000);
			const requests = [];
			page.on('request', (request) => {
				if (/^https?:/.test(request.url())) requests.push(request.url());
			});
			await page.goto(pathToFileURL(path.join(singleRoot, 'dist/index.html')).href);
			await page.getByRole('button', { name: 'Count: 0' }).click();
			await page.getByRole('button', { name: 'Count: 1' }).waitFor();
			assert.equal(
				await page.getByAltText('Embedded mark').evaluate((image) => image.naturalWidth),
				16
			);
			assert.deepEqual(requests, []);
		} finally {
			await context.close();
		}
		console.log(
			'Generated external applications passed: production SSR, development SSR, hydration, continuations, and offline single-file interaction/assets.'
		);
	} finally {
		await browser.close();
		await rm(temporary, { recursive: true, force: true });
	}
}

/** Resolves unpublished workspace packages without depending on a surrounding project directory. */
async function linkDependencies(root, workspace) {
	await mkdir(path.join(root, 'node_modules'));
	for (const name of await readdir(path.join(workspace, 'node_modules'))) {
		if (name === '@exactjs') continue;
		await symlink(
			path.join(workspace, 'node_modules', name),
			path.join(root, 'node_modules', name),
			process.platform === 'win32' ? 'junction' : 'dir'
		);
	}
	await mkdir(path.join(root, 'node_modules/@exactjs'));
	for (const name of await readdir(path.join(workspace, 'node_modules/@exactjs'))) {
		const destination = path.join(root, 'node_modules/@exactjs', name);
		if (name === 'vitest') {
			await mkdir(destination);
			await cp(path.join(workspace, 'packages/vitest/dist'), path.join(destination, 'dist'), {
				recursive: true
			});
			await cp(
				path.join(workspace, 'packages/vitest/package.json'),
				path.join(destination, 'package.json')
			);
		} else
			await symlink(
				path.join(workspace, 'node_modules/@exactjs', name),
				destination,
				process.platform === 'win32' ? 'junction' : 'dir'
			);
	}
	await symlink(
		path.join(workspace, 'framework-adapters/vite-plugin/node_modules/vite'),
		path.join(root, 'node_modules/vite'),
		process.platform === 'win32' ? 'junction' : 'dir'
	);
}

/** Runs a finite build/check command and retains output only on failure. */
async function run(executable, args, cwd) {
	const child = spawn(executable, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
	let output = '';
	child.stdout.on('data', (chunk) => (output += chunk));
	child.stderr.on('data', (chunk) => (output += chunk));
	const [code] = await once(child, 'exit');
	if (code !== 0) throw new Error(output);
}

/** Starts one owned host and closes it even when browser assertions fail. */
async function withServer(cwd, command, work) {
	const { createServer } = await import('node:net');
	const reservation = createServer();
	reservation.listen(0, '127.0.0.1');
	await once(reservation, 'listening');
	const port = reservation.address().port;
	await new Promise((resolve) => reservation.close(resolve));
	const child = spawn(process.execPath, [command], {
		cwd,
		env: { ...process.env, PORT: String(port) },
		stdio: ['ignore', 'pipe', 'pipe']
	});
	let output = '';
	child.stdout.on('data', (chunk) => (output += chunk));
	child.stderr.on('data', (chunk) => (output += chunk));
	const exited = once(child, 'exit');
	const origin = `http://127.0.0.1:${port}/`;
	try {
		let ready = false;
		for (let attempt = 0; attempt < 150; attempt++) {
			if (child.exitCode !== null) throw new Error(output);
			try {
				if ((await fetch(origin)).ok) {
					ready = true;
					break;
				}
			} catch {}
			await new Promise((resolve) => setTimeout(resolve, 100));
		}
		assert.ok(ready, `Host did not start: ${output}`);
		await work(origin);
	} finally {
		if (child.exitCode === null) child.kill('SIGTERM');
		await exited;
	}
}

await main();
