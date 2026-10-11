import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFile } from 'node:fs/promises';
import { createServer } from 'vite';
import { it, onTestFinished } from 'vitest';
import { exact } from '../src/index.js';
import { createInstalledThemeFixture } from '../../test-support/installed-theme.js';
import { copyInstalledRuntimePackages } from '../../test-support/installed-runtime-packages.js';

it('retains optimized browser enhancements and interactions after source reloads', async () => {
	const fixture = await createInstalledThemeFixture('authored');
	onTestFinished(fixture.dispose);
	await copyInstalledRuntimePackages(fixture.root, ['@exactjs/dom', '@exactjs/devtools-runtime']);
	const source = `import type {Component} from '@exactjs/core';
export function Page(this:Component<{active:boolean}>){this.state.active=false;return()=> <section theme:scope theme:appearance="dark"><button theme:status="success" onClick={()=>this.state.active=!this.state.active}>{this.state.active?'Active':'Ready'}</button><span>Initial</span></section>;}`;
	await writeFile(path.join(fixture.root, 'Page.tsx'), source);
	await writeFile(
		path.join(fixture.root, 'client.tsx'),
		`import {render} from '@exactjs/dom';import {Page} from './Page.js';render(<Page/>,document.getElementById('app')!);`
	);
	await writeFile(
		path.join(fixture.root, 'index.html'),
		'<div id="app"></div><script type="module" src="/client.tsx"></script>'
	);
	const vite = await createServer({
		root: fixture.root,
		configFile: false,
		logLevel: 'error',
		plugins: [exact({ reactCompatibility: false })],
		server: { host: '127.0.0.1', port: 0 }
	});
	try {
		await vite.listen();
		// Compile the authored entry before the browser starts so dependency discovery sees compiler imports.
		await vite.transformRequest('/Page.tsx');
		await vite.transformRequest('/client.tsx');
		const address = vite.httpServer!.address();
		if (!address || typeof address === 'string')
			throw new Error('Development fixture has no TCP listener');
		const journey = fileURLToPath(
			new URL('../../test-support/development-theme-browser.mjs', import.meta.url)
		);
		await promisify(execFile)(
			process.execPath,
			[journey, fixture.root, `http://127.0.0.1:${address.port}`],
			{ timeout: 45_000 }
		);
	} finally {
		await vite.close();
	}
}, 60_000);
