import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { bundlers, createExactApp, runtimes } from './project-generation.js';

describe('create-exact-app', () => {
	it('installs through the active npm CLI without executing a Windows command shim', async () => {
		const root = await mkdtemp(path.join(tmpdir(), 'exact installer '));
		const previous = process.env.npm_execpath;
		try {
			const installer = path.join(root, 'npm-cli.mjs');
			await writeFile(
				installer,
				'import { writeFileSync } from "node:fs"; writeFileSync("installed.json", JSON.stringify(process.argv.slice(2)));'
			);
			process.env.npm_execpath = installer;
			const directory = path.join(root, 'app with spaces');
			await createExactApp({
				directory,
				name: 'installer-test',
				bundler: 'vite',
				runtime: 'browser',
				testRunner: 'none',
				skill: false,
				install: true
			});
			expect(JSON.parse(await readFile(path.join(directory, 'installed.json'), 'utf8'))).toEqual([
				'install'
			]);
		} finally {
			if (previous === undefined) delete process.env.npm_execpath;
			else process.env.npm_execpath = previous;
			await rm(root, { recursive: true, force: true });
		}
	});
	it('rejects an unknown package manager before creating the target', async () => {
		const root = await mkdtemp(path.join(tmpdir(), 'create-exact-app-invalid-manager-'));
		const target = path.join(root, 'sample');

		await expect(
			createExactApp({
				directory: target,
				name: 'sample',
				bundler: 'vite',
				runtime: 'browser',
				testRunner: 'none',
				skill: false,
				install: true,
				packageManager: 'npm & unwanted-command' as 'npm'
			})
		).rejects.toThrow('Unsupported package manager');
	});

	it('creates a Vite and Vitest browser application with the Agent Skill', async () => {
		const root = await mkdtemp(path.join(tmpdir(), 'create-exact-app-'));
		const target = path.join(root, 'sample');
		await createExactApp({
			directory: target,
			name: 'sample',
			bundler: 'vite',
			runtime: 'browser',
			testRunner: 'vitest',
			skill: true
		});

		const manifest = JSON.parse(await readFile(path.join(target, 'package.json'), 'utf8'));
		const config = await readFile(path.join(target, 'vite.config.ts'), 'utf8');
		expect(manifest.devDependencies).toHaveProperty('@exactjs/vitest');
		expect(manifest.devDependencies.typescript).toBe('^7.0.2');
		expect(manifest.dependencies).not.toHaveProperty('@exactjs/compiler');
		expect(config).not.toContain('compiler:');
		expect(manifest.scripts.typecheck).toBe('exactc --check --project tsconfig.json');
		expect(manifest.devDependencies).toHaveProperty('@exactjs/compiler');
		expect(config).toContain('exactVitest');
		expect(config).toContain('from "vitest/config"');
		expect(await readFile(path.join(target, 'src/env.d.ts'), 'utf8')).toContain(
			'declare module "*.css"'
		);
		expect(
			await readFile(path.join(target, '.agents/skills/exact-web-development/SKILL.md'), 'utf8')
		).toContain('name: exact-web-development');
	});

	it('creates a server adapter and Jest configuration', async () => {
		const root = await mkdtemp(path.join(tmpdir(), 'create-exact-app-'));
		const target = path.join(root, 'hapi');
		await createExactApp({
			directory: target,
			name: 'hapi-app',
			bundler: 'webpack',
			runtime: 'hapi',
			testRunner: 'jest',
			skill: false
		});

		const manifest = JSON.parse(await readFile(path.join(target, 'package.json'), 'utf8'));
		expect(manifest.dependencies).toHaveProperty('@exactjs/hapi-adapter');
		expect(manifest.devDependencies).toHaveProperty('@exactjs/jest');
		expect(manifest.dependencies).toHaveProperty('@exactjs/server');
		const config = await readFile(path.join(target, 'webpack.config.mjs'), 'utf8');
		expect(config).toContain('extensionAlias');
		expect(config).toContain('new HtmlWebpackPlugin({ template: "./index.html" })');
		expect(await readFile(path.join(target, 'index.html'), 'utf8')).not.toContain(
			'/src/client.tsx'
		);
		expect(await readFile(path.join(target, 'src/server.ts'), 'utf8')).toContain('exactHapiPlugin');
	});

	it('configures a selected React compatibility target for build and type checking', async () => {
		const root = await mkdtemp(path.join(tmpdir(), 'create-exact-app-react-'));
		const target = path.join(root, 'react');
		await createExactApp({
			directory: target,
			name: 'react-interop-app',
			bundler: 'vite',
			runtime: 'browser',
			testRunner: 'vitest',
			skill: false,
			reactCompatibility: 19
		});

		const manifest = JSON.parse(await readFile(path.join(target, 'package.json'), 'utf8'));
		const config = await readFile(path.join(target, 'vite.config.ts'), 'utf8');
		const tsconfig = JSON.parse(await readFile(path.join(target, 'tsconfig.json'), 'utf8'));
		expect(manifest.dependencies).toHaveProperty('@exactjs/react-compat');
		expect(manifest.devDependencies.react).toBe('^19.2.0');
		expect(config).toContain('reactCompatibility: { target: 19 }');
		expect(tsconfig.compilerOptions.jsx).toBe('preserve');
		expect(tsconfig.compilerOptions.types).toContain('@exactjs/react-compat/types19');
	});

	it('creates native Bun component tests with the eXact preload', async () => {
		const root = await mkdtemp(path.join(tmpdir(), 'create-exact-app-'));
		const target = path.join(root, 'bun-test');
		await createExactApp({
			directory: target,
			name: 'bun-test-app',
			bundler: 'bun',
			runtime: 'bun',
			testRunner: 'bun',
			skill: false
		});

		const manifest = JSON.parse(await readFile(path.join(target, 'package.json'), 'utf8'));
		expect(manifest.devDependencies).toHaveProperty('@exactjs/bun-test');
		expect(manifest.scripts.test).toBe('bun --conditions=browser test');
		const build = await readFile(path.join(target, 'scripts/build.ts'), 'utf8');
		expect(build).toContain('Bun.write("dist/index.html", html)');
		expect(build).toContain('await plugin.dispose()');
		expect(manifest.scripts.dev).toBe('bun run scripts/dev.ts');
		await expect(readFile(path.join(target, 'vitest.config.ts'), 'utf8')).rejects.toThrow();
		expect(await readFile(path.join(target, 'bunfig.toml'), 'utf8')).toContain(
			'@exactjs/bun-test/preload'
		);
		expect(await readFile(path.join(target, 'src/App.test.tsx'), 'utf8')).toContain(
			'from "bun:test"'
		);
	});

	it('materializes every advertised build and runtime option', async () => {
		const root = await mkdtemp(path.join(tmpdir(), 'create-exact-app-matrix-'));
		for (const bundler of bundlers) {
			for (const runtime of runtimes) {
				const target = path.join(root, `${bundler}-${runtime}`);
				await createExactApp({
					directory: target,
					name: `${bundler}-${runtime}`,
					bundler,
					runtime,
					testRunner: 'none',
					skill: false
				});
				const manifest = JSON.parse(await readFile(path.join(target, 'package.json'), 'utf8'));
				expect(manifest.scripts).toHaveProperty('build');
				if (runtime === 'browser') {
					await expect(readFile(path.join(target, 'src/server.ts'), 'utf8')).rejects.toThrow();
				} else {
					expect(manifest.dependencies).toHaveProperty(`@exactjs/${runtime}-adapter`);
				}
			}
		}
	});
});
