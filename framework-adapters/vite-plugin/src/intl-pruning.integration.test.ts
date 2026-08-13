import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	rmSync,
	symlinkSync,
	writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, type Plugin } from 'vite';
import { expect, it, onTestFinished } from 'vitest';
import { exact } from './index.js';

it('prunes descriptor companions owned by unused components in a shared source module', async () => {
	const root = mkdtempSync(path.join(tmpdir(), 'exact-intl-pruning-'));
	onTestFinished(() => rmSync(root, { recursive: true, force: true }));
	const sourceDirectory = path.join(root, 'src');
	mkdirSync(sourceDirectory, { recursive: true });
	const exactScope = path.join(root, 'node_modules', '@exactjs');
	mkdirSync(exactScope, { recursive: true });
	symlinkSync(
		path.join(fileURLToPath(new URL('../../..', import.meta.url)), 'packages', 'intl'),
		path.join(exactScope, 'intl'),
		'junction'
	);
	writeFileSync(
		path.join(root, 'package.json'),
		JSON.stringify({ name: 'exact-intl-pruning-fixture', private: true, type: 'module' })
	);
	writeFileSync(
		path.join(sourceDirectory, 'views.tsx'),
		`export function Used() { return () => <p intl:message>REACHABLE_MESSAGE</p>; }
export function Unused() { return () => <p intl:message>UNREACHABLE_SECRET</p>; }
`
	);
	const entry = path.join(sourceDirectory, 'entry.ts');
	writeFileSync(
		entry,
		`import { Used } from './views.js';
globalThis.__exactIntlPruningFixture = Used;
`
	);
	const output = path.join(root, 'dist');

	await build({
		root,
		configFile: false,
		logLevel: 'silent',
		plugins: [
			exact({
				applicationRoot: root,
				reactCompatibility: false,
				internationalization: { owner: 'fixture', sourceLocale: 'en-US' }
			}) as unknown as Plugin
		],
		build: {
			ssr: entry,
			outDir: output,
			rollupOptions: { external: (id) => id.startsWith('@exactjs/') }
		}
	});

	const program = readdirSync(output, { recursive: true })
		.filter((file) => String(file).endsWith('.js'))
		.map((file) => readFileSync(path.join(output, String(file)), 'utf8'))
		.join('\n');
	expect(program).toContain('REACHABLE_MESSAGE');
	expect(program).not.toContain('UNREACHABLE_SECRET');
});
