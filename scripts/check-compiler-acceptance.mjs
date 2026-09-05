import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
import path from 'node:path';
import process from 'node:process';

import { chromium } from 'playwright';

const root = path.resolve(import.meta.dirname, '..');
const npmCli =
	process.env.npm_execpath ??
	(process.platform === 'win32'
		? path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js')
		: undefined);
const npmCommand =
	npmCli && existsSync(npmCli)
		? { command: process.execPath, prefix: [npmCli] }
		: { command: 'npm', prefix: [] };
const requestedApplication = process.env.EXACT_ACCEPTANCE_APP?.toLowerCase();
const applications = [
	{ key: 'sudoku', name: 'Sudoku', workspace: '@exactjs/sample-sudoku', journey: checkSudoku },
	{ key: 'docs', name: 'docs', workspace: '@exactjs/docs', journey: checkDocs },
	{
		key: 'shipping',
		name: 'shipping continuations',
		workspace: '@exactjs/sample-shipping-calculator',
		journey: checkShipping
	},
	{
		key: 'intl',
		name: 'component localization',
		workspace: '@exactjs/sample-intl-testbed',
		journey: checkIntl,
		production: true
	},
	{
		key: 'workbench',
		name: 'Workbench status movement',
		workspace: '@exactjs/sample-workbench',
		journey: checkWorkbench,
		production: true
	}
];
const selectedApplications = requestedApplication
	? applications.filter(({ key }) => key === requestedApplication)
	: applications;
const coldApplicationTimeout = 90_000;
if (!selectedApplications.length)
	throw new Error(`Unknown EXACT_ACCEPTANCE_APP ${requestedApplication}`);
const browser = await chromium.launch({ headless: true });
let failure;

try {
	for (const application of selectedApplications) await checkApplication(application);
	console.log(
		`Compiler browser acceptance passed (${selectedApplications.map(({ name }) => name).join(', ')}).`
	);
} catch (error) {
	failure = error;
}
if (failure) console.error(failure);
// Playwright's browser and driver are child processes; an explicit exit tears both down after
// every application server and browser context has completed its own cleanup.
process.exit(failure ? 1 : 0);

async function checkApplication({ name, workspace, journey, production = false }) {
	const port = await availablePort();
	const server = await startServer(workspace, port, production);
	try {
		await server.ready(port);
		const context = await browser.newContext();
		const page = await context.newPage();
		// A clean CI worker compiles the application after navigation. Allow that owned compiler work
		// to finish without treating Vite's dependency traffic as application readiness.
		page.setDefaultTimeout(coldApplicationTimeout);
		page.setDefaultNavigationTimeout(coldApplicationTimeout);
		const failures = [];
		page.on('pageerror', (error) => failures.push(`page error: ${error.stack ?? error.message}`));
		page.on('console', (message) => {
			if (message.type() === 'error') failures.push(`console error: ${message.text()}`);
		});
		try {
			try {
				await journey(page, `http://127.0.0.1:${port}`);
				await page.waitForTimeout(100);
				if (failures.length) throw new Error(failures.join('\n'));
				console.log(`  ${name} passed`);
			} catch (error) {
				const body = await page
					.locator('body')
					.innerText()
					.catch(() => '');
				const diagnostics = [...failures, body].filter(Boolean).join('\n');
				throw diagnostics ? new Error(diagnostics, { cause: error }) : error;
			}
		} finally {
			await context.close();
		}
	} catch (error) {
		throw new Error(`${name} acceptance failed`, { cause: error });
	} finally {
		await server.stop();
	}
}

async function checkSudoku(page, origin) {
	await page.goto(origin, { waitUntil: 'networkidle' });
	await page.getByRole('heading', { name: 'A quiet place to think.' }).waitFor();
	await page.getByRole('grid', { name: 'Sudoku puzzle' }).waitFor();
	const timer = page.locator('.game-meta .elapsed-clock');
	const before = await timer.textContent();
	await expectEventually(
		async () => (await timer.textContent()) !== before,
		'Sudoku timer did not update'
	);
}

async function checkDocs(page, origin) {
	await navigateToDocs(page, origin);
	await page.getByRole('heading', { name: 'Build reactive apps with TypeScript' }).waitFor();
	await page.locator('.copy-button').first().waitFor();
	await page.getByRole('button', { name: '+1' }).click();
	await expectEventually(
		async () => (await page.locator('.counter-value').textContent()) === '1',
		'docs counter did not react to input'
	);
}

async function checkShipping(page, origin) {
	const exactStatuses = [];
	page.on('response', (response) => {
		if (new URL(response.url()).pathname === '/__exact') exactStatuses.push(response.status());
	});
	await page.goto(origin, { waitUntil: 'networkidle' });
	await page.getByRole('heading', { name: 'Find the right way to send it.' }).waitFor();
	await page.getByRole('heading', { name: 'DOOP Standard' }).waitFor();
	if (exactStatuses.length)
		throw new Error(
			`shipping redundantly refreshed its server-rendered revision: ${exactStatuses}`
		);
	const initialRequests = exactStatuses.length;
	await page.getByLabel('To ZIP').fill('97209');
	await expectEventually(
		async () => exactStatuses.length > initialRequests && exactStatuses.at(-1) === 200,
		'shipping did not perform a successful continuation request after input'
	);
	if (exactStatuses.some((status) => status !== 200)) {
		throw new Error(`shipping __exact requests returned ${exactStatuses.join(', ')}`);
	}
	await page.getByRole('heading', { name: 'DOOP Today' }).waitFor();
}

async function checkIntl(page, origin) {
	await page.goto(origin, { waitUntil: 'networkidle' });
	const french = page.locator('[data-locale="fr-FR"]');
	const japanese = page.locator('[data-locale="ja-JP"]');
	const arabic = page.locator('[data-locale="ar-EG"]');
	await french.getByRole('heading', { name: 'La même source, localisée' }).waitFor();
	await japanese.getByRole('heading', { name: '同じソースをローカライズ' }).waitFor();
	await arabic.getByRole('heading', { name: 'المصدر نفسه، مترجم' }).waitFor();
	if ((await arabic.getAttribute('dir')) !== 'rtl')
		throw new Error('Arabic component localization did not project RTL direction');
	await page.getByLabel('Name').fill('Jordan');
	await french.getByText('Bonjour, Jordan.', { exact: false }).waitFor();
}

async function checkWorkbench(page, origin) {
	await page.goto(origin, { waitUntil: 'networkidle' });
	await page.getByRole('heading', { name: 'Project Workbench' }).waitFor();
	const backlog = page.locator('.column').filter({
		has: page.getByRole('heading', { name: 'Backlog', exact: true })
	});
	const active = page.locator('.column').filter({
		has: page.getByRole('heading', { name: 'Active', exact: true })
	});
	const title = 'Build command palette actions';
	const backlogCard = backlog.locator('.task-card').filter({ hasText: title });
	await backlogCard.getByRole('button', { name: 'Active', exact: true }).click();
	await expectEventually(
		async () =>
			(await backlog.locator('.task-card').filter({ hasText: title }).count()) === 0 &&
			(await active.locator('.task-card').filter({ hasText: title }).count()) === 1,
		'Workbench card did not move to its updated status column'
	);
}

async function navigateToDocs(page, origin) {
	// Vite keeps development connections and dependency discovery active beyond initial page
	// readiness. The visible journey below is the acceptance signal, not network quiescence.
	await page.goto(origin, { waitUntil: 'domcontentloaded' });
}

async function startServer(workspace, port, production) {
	const applicationDirectory = {
		'@exactjs/sample-sudoku': path.join(root, 'apps', 'sudoku'),
		'@exactjs/docs': path.join(root, 'apps', 'docs'),
		'@exactjs/sample-shipping-calculator': path.join(root, 'apps', 'shipping-calculator'),
		'@exactjs/sample-intl-testbed': path.join(root, 'apps', 'intl-testbed'),
		'@exactjs/sample-workbench': path.join(root, 'apps', 'workbench')
	}[workspace];
	const shipping = workspace === '@exactjs/sample-shipping-calculator';
	const hmrPort = shipping ? await availablePort() : undefined;
	if (production) {
		await runProcess(
			npmCommand.command,
			[...npmCommand.prefix, 'run', 'build', '-w', workspace],
			root,
			'inherit'
		);
	} else if (shipping) {
		await runProcess(
			npmCommand.command,
			[...npmCommand.prefix, 'run', 'generate', '-w', workspace],
			root,
			'inherit'
		);
	}
	const child = spawn(
		process.execPath,
		shipping
			? ['scripts/dev.mjs']
			: [
					path.join(root, 'scripts', 'start-vite-acceptance-server.mjs'),
					applicationDirectory,
					...(production ? ['--preview'] : [])
				],
		{
			cwd: applicationDirectory,
			env: {
				...process.env,
				PORT: String(port),
				...(hmrPort ? { HMR_PORT: String(hmrPort) } : {})
			},
			stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
			windowsHide: true
		}
	);
	let startupError;
	child.once('error', (error) => (startupError = error));
	const closed = new Promise((resolve) => child.once('close', resolve));
	return {
		async ready(serverPort) {
			await expectEventually(
				async () => {
					if (startupError) throw fatal(startupError);
					if (child.exitCode !== null) {
						throw fatal(new Error(`development server exited with code ${child.exitCode}`));
					}
					try {
						const response = await fetch(`http://127.0.0.1:${serverPort}`);
						return response.status < 500;
					} catch {
						return false;
					}
				},
				'development server did not become ready',
				90_000
			);
		},
		async stop() {
			if (child.exitCode !== null) return;
			child.send({ type: 'exact-acceptance-close' });
			let closeTimeout;
			await Promise.race([
				closed,
				new Promise((resolve) => {
					closeTimeout = setTimeout(resolve, 5_000);
				})
			]);
			clearTimeout(closeTimeout);
			if (child.exitCode === null) child.kill();
		}
	};
}

async function expectEventually(predicate, message, timeout = 10_000) {
	const deadline = Date.now() + timeout;
	let lastError;
	while (Date.now() < deadline) {
		try {
			if (await predicate()) return;
		} catch (error) {
			if (error?.fatal) throw error;
			lastError = error;
		}
		await delay(100);
	}
	throw new Error(message, { cause: lastError });
}

function availablePort() {
	return new Promise((resolve, reject) => {
		const server = createServer();
		server.once('error', reject);
		server.listen(0, '127.0.0.1', () => {
			const address = server.address();
			if (!address || typeof address === 'string') {
				server.close();
				reject(new Error('Unable to allocate an acceptance-test port'));
				return;
			}
			server.close((error) => (error ? reject(error) : resolve(address.port)));
		});
	});
}

function runProcess(command, args, cwd = root, stdio = 'ignore') {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, { cwd, stdio, windowsHide: true });
		child.once('error', reject);
		child.once('exit', (code) =>
			code === 0 ? resolve() : reject(new Error(`${command} exited with ${code}`))
		);
	});
}

function delay(milliseconds) {
	return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function fatal(error) {
	error.fatal = true;
	return error;
}
