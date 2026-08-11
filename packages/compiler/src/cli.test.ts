import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const cliPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist/cli.js');

describe('exactc', { timeout: 15_000 }, () => {
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
		expect(output).toContain('__exactVNode("span"');
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
