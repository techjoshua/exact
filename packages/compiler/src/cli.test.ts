import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { createTestWorkspace } from './test-support/workspace.js';

const execFileAsync = promisify(execFile);
const cliPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist/cli.js');

describe('exactc', { timeout: 15_000 }, () => {
	it('selects inherited project roots, including unreferenced fixtures, unless paths are explicit', async () => {
		const root = await createTestWorkspace('exact-cli-project-');
		await mkdir(path.join(root, 'src'));
		await mkdir(path.join(root, 'scripts'));
		await writeFile(
			path.join(root, 'base.json'),
			JSON.stringify({
				compilerOptions: { strict: true },
				include: ['src'],
				exclude: ['src/excluded.ts']
			})
		);
		await writeFile(path.join(root, 'tsconfig.json'), JSON.stringify({ extends: './base.json' }));
		await writeFile(path.join(root, 'src/model.ts'), 'export const answer: number = 42;');
		await writeFile(path.join(root, 'src/excluded.ts'), 'const excluded: string = 42;');
		await writeFile(path.join(root, 'scripts/build.ts'), 'const outside: string = 42;');
		const run = (...args: string[]) =>
			execFileAsync(process.execPath, [cliPath, '--check', ...args], { cwd: root });
		await expect(run()).resolves.toMatchObject({ stdout: '' });
		await expect(run('--project', 'tsconfig.json')).resolves.toMatchObject({ stdout: '' });
		await writeFile(
			path.join(root, 'src/orphan.fixture.ts'),
			'const fixture: { required: string } = {};'
		);
		await expect(run('--project', 'tsconfig.json')).rejects.toMatchObject({
			code: 1,
			stderr: expect.stringContaining("Property 'required' is missing")
		});
		await expect(run('--project', 'tsconfig.json', 'scripts')).rejects.toMatchObject({
			code: 1,
			stderr: expect.stringContaining("Type 'number' is not assignable to type 'string'")
		});
		await expect(run('--project', 'missing.json')).rejects.toMatchObject({
			code: 1,
			stderr: expect.stringContaining('missing.json')
		});
	});

	it.each(['x.draft', '(x.draft)', '((x.draft))'])(
		'preserves narrowed delete operand %s',
		async (operand) => {
			await mkdir(path.resolve('.tmp'), { recursive: true });
			const root = await createTestWorkspace('exact-cli-delete-', path.resolve('.tmp'));
			await writeFile(
				path.join(root, 'tsconfig.json'),
				JSON.stringify({
					compilerOptions: {
						strict: true,
						skipLibCheck: true,
						module: 'NodeNext',
						jsx: 'react-jsx',
						jsxImportSource: '@exactjs/jsx',
						types: []
					}
				})
			);
			await writeFile(
				path.join(root, 'model.tsx'),
				`export function clear(x: { draft?: { title: string } }) { if (x.draft) delete ${operand}; } export function View() { return () => <div />; }`
			);
			await expect(
				execFileAsync(process.execPath, [cliPath, '--check'], { cwd: root })
			).resolves.toMatchObject({ stdout: '' });
			await writeFile(
				path.join(root, 'model.tsx'),
				'export function clear(x: { draft: { title: string } }) { delete x.draft; }'
			);
			await expect(
				execFileAsync(process.execPath, [cliPath, '--check'], { cwd: root })
			).rejects.toMatchObject({ stderr: expect.stringContaining('optional') });
		}
	);

	it('checks compiler-lowered source without emitting files', async () => {
		const root = await mkdtemp(path.join(tmpdir(), 'exact-cli-check-'));
		const input = path.join(root, 'model.ts');
		await writeFile(input, 'const answer: number = 42; void answer;');

		const result = await execFileAsync(process.execPath, [cliPath, '--check', root]);

		expect(result.stdout).toBe('');
		expect(await readdir(root)).toEqual(['model.ts']);
	});

	it('reports ordinary TypeScript failures from check mode', async () => {
		const root = await mkdtemp(path.join(tmpdir(), 'exact-cli-check-error-'));
		const input = path.join(root, 'model.ts');
		await writeFile(input, 'const answer: string = 42; void answer;');

		await expect(execFileAsync(process.execPath, [cliPath, '--check', root])).rejects.toMatchObject(
			{
				stderr: expect.stringContaining("Type 'number' is not assignable to type 'string'")
			}
		);
	});

	it('compiles TSX files through the CLI', async () => {
		const root = await mkdtemp(path.join(tmpdir(), 'exact-cli-'));
		const input = path.join(root, 'src', 'view.tsx');
		const outDir = path.join(root, 'out');
		await mkdir(path.dirname(input), { recursive: true });
		await writeFile(input, 'const view = <span />;');

		await execFileAsync(process.execPath, [
			cliPath,
			'--rootDir',
			path.join(root, 'src'),
			'--outDir',
			outDir,
			input
		]);

		const output = await readFile(path.join(outDir, 'view.ts'), 'utf8');
		expect(output).toContain('__exactPreparedRenderProgram(__exact_render_program_1');
		expect(output).toContain('directClaims: true');
	});

	it('rejects the removed target-neutral executable target', async () => {
		const root = await mkdtemp(path.join(tmpdir(), 'exact-cli-target-'));
		const input = path.join(root, 'view.tsx');
		await writeFile(input, 'const view = <span />;');

		await expect(
			execFileAsync(process.execPath, [cliPath, '--target', 'default', input])
		).rejects.toMatchObject({ stderr: expect.stringContaining('Invalid --target default') });
	});

	it('emits source maps through the CLI', async () => {
		const root = await mkdtemp(path.join(tmpdir(), 'exact-cli-map-'));
		const input = path.join(root, 'src', 'view.tsx');
		const outDir = path.join(root, 'out');
		await mkdir(path.dirname(input), { recursive: true });
		await writeFile(input, 'const view = <span />;');

		await execFileAsync(process.execPath, [
			cliPath,
			'--rootDir',
			path.join(root, 'src'),
			'--outDir',
			outDir,
			'--sourceMap',
			input
		]);

		const output = await readFile(path.join(outDir, 'view.ts'), 'utf8');
		const map = JSON.parse(await readFile(path.join(outDir, 'view.ts.map'), 'utf8'));

		expect(output).toContain('//# sourceMappingURL=view.ts.map');
		expect(map.file).toBe('view.ts');
		expect(map.sources).toEqual([input]);
	});

	it('honors target flags without emitting compiler sidecars', async () => {
		const root = await mkdtemp(path.join(tmpdir(), 'exact-cli-analysis-'));
		const input = path.join(root, 'src', 'page.tsx');
		const outDir = path.join(root, 'out');
		await mkdir(path.dirname(input), { recursive: true });
		await writeFile(
			input,
			'import { TaskContext } from "@exactjs/core";\n\n      import { readFile } from "node:fs/promises";\n      function Page(this: Component<{ title?: string; width?: number }>) {\n        const runFixtureTask = async (_task: TaskContext = TaskContext.latest()) => {\n          this.state.title = await readFile("title.txt", "utf8");\n        };\nrunFixtureTask();\n        const runFixtureTask2 = (_task: TaskContext = TaskContext.latest()) => {\n          this.state.width = window.innerWidth;\n        };\nrunFixtureTask2();\n        return () => <h1>{this.state.title}</h1>;\n      }\n    '
		);

		await execFileAsync(process.execPath, [
			cliPath,
			'--rootDir',
			path.join(root, 'src'),
			'--outDir',
			outDir,
			'--target',
			'client',
			input
		]);

		const output = await readFile(path.join(outDir, 'page.ts'), 'utf8');

		expect(output).not.toContain('node:fs/promises');
		expect(output).toContain('window.innerWidth');
		expect(await readdir(outDir)).toEqual(['page.ts']);
	});

	it('emits paired target artifacts through the CLI', async () => {
		const root = await mkdtemp(path.join(tmpdir(), 'exact-cli-artifacts-'));
		const input = path.join(root, 'src', 'page.tsx');
		const outDir = path.join(root, 'out');
		await mkdir(path.dirname(input), { recursive: true });
		await writeFile(
			input,
			'import { TaskContext } from "@exactjs/core";\n\n      import { readFile } from "node:fs/promises";\n      function Page(this: Component<{ title?: string; width?: number }>) {\n        const runFixtureTask = async (_task: TaskContext = TaskContext.server()) => {\n          this.state.title = await readFile("title.txt", "utf8");\n        };\nrunFixtureTask();\n        const runFixtureTask2 = (_task: TaskContext = TaskContext.client()) => {\n          this.state.width = window.innerWidth;\n        };\nrunFixtureTask2();\n        return () => <h1>{this.state.title}</h1>;\n      }\n    '
		);

		await execFileAsync(process.execPath, [
			cliPath,
			'--rootDir',
			path.join(root, 'src'),
			'--outDir',
			outDir,
			'--artifacts',
			input
		]);

		const client = await readFile(path.join(outDir, 'page.exact.client.ts'), 'utf8');
		const server = await readFile(path.join(outDir, 'page.exact.server.ts'), 'utf8');

		expect(client).not.toContain('node:fs/promises');
		expect(client).toContain('window.innerWidth');
		expect(server).toContain('node:fs/promises');
		expect(server).not.toContain('window.innerWidth');
		expect((await readdir(outDir)).sort()).toEqual([
			'page.exact.client.ts',
			'page.exact.server.ts'
		]);
	});

	it('emits server component client artifacts through the CLI', async () => {
		const root = await mkdtemp(path.join(tmpdir(), 'exact-cli-server-components-'));
		const input = path.join(root, 'src', 'page.tsx');
		const outDir = path.join(root, 'out');
		await mkdir(path.dirname(input), { recursive: true });
		await writeFile(
			input,
			'import { TaskContext } from "@exactjs/core";\n\n      import { readFile } from "node:fs/promises";\n      export function Page(this: Component<{ count: number }>) {\n        const runFixtureTask = async (_task: TaskContext = TaskContext.server()) => {\n          await readFile("page.txt", "utf8");\n        };\nrunFixtureTask();\n        return () => <button onClick={() => this.state.count++}>{this.state.count}</button>;\n      }\n    '
		);

		await execFileAsync(process.execPath, [
			cliPath,
			'--rootDir',
			path.join(root, 'src'),
			'--outDir',
			outDir,
			'--artifacts',
			'--serverComponents',
			input
		]);

		const client = await readFile(path.join(outDir, 'page.exact.client.ts'), 'utf8');
		const server = await readFile(path.join(outDir, 'page.exact.server.ts'), 'utf8');

		expect(client).toContain('Page_ExactClient_1');
		expect(client).toMatch(/export const Page = \/\* @__PURE__ \*\/ \(\(\) => Object\.assign/);
		expect(client).toContain('__exactBoundary(');
		expect(client).not.toContain('node:fs/promises');
		expect(server).toMatch(/export const Page = \/\* @__PURE__ \*\/ \(\(\) => Object\.assign/);
		expect(server).toContain('__exactBoundary');
	});
});
