import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { existsSync } from 'node:fs';
import ts from 'typescript';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { onTestFinished } from 'vitest';

/** Resolves checked-in fixtures and workspace providers independently of the test command's cwd. */
export function repositoryPath(...segments: string[]): string {
	return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..', ...segments);
}

/**
 * Creates a temporary compiler workspace and registers failure-safe cleanup.
 *
 * Cleanup is registered before the path is returned, ensuring later fixture
 * setup failures cannot leave repository-local build artifacts behind.
 */
export async function createTestWorkspace(
	prefix: string,
	parent: string = tmpdir()
): Promise<string> {
	const root = await mkdtemp(path.join(parent, prefix));
	onTestFinished(() => rm(root, { recursive: true, force: true }));
	return root;
}

/**
 * Creates a fixture whose program roots are its explicitly requested sources and imports.
 * Retains the enclosing project's compiler options without inheriting unrelated source roots.
 * Fixtures requiring additional ambient roots or a complete source glob own an explicit config.
 */
export async function createCompilerTestWorkspace(
	prefix: string,
	parent?: string
): Promise<string> {
	const root = await createTestWorkspace(prefix, parent);
	const parentConfig = ts.findConfigFile(path.resolve(parent ?? tmpdir()), existsSync);
	// The repository solution config only lists project references. Its compiler fixture
	// environment is the compiler project, regardless of the test command's cwd.
	const config =
		parentConfig && path.resolve(parentConfig) !== repositoryPath('tsconfig.json')
			? parentConfig
			: repositoryPath('packages/compiler/tsconfig.json');
	await writeFile(
		path.join(root, 'tsconfig.json'),
		JSON.stringify({
			extends: config,
			files: [],
			include: []
		})
	);
	return root;
}

/**
 * Writes a map of workspace-relative fixture files and returns their paths.
 */
export async function writeTestFiles(
	root: string,
	files: Readonly<Record<string, string>>
): Promise<Readonly<Record<string, string>>> {
	const paths: Record<string, string> = {};
	for (const [relative, source] of Object.entries(files)) {
		const filename = path.join(root, relative);
		await writeFile(filename, source);
		paths[relative] = filename;
	}
	return paths;
}

/** Creates a browser application fixture whose DOM globals and timers do not inherit the compiler package's Node environment. */
export async function createBrowserTestWorkspace(prefix: string, parent?: string): Promise<string> {
	const root = await createTestWorkspace(prefix, parent);
	await writeFile(
		path.join(root, 'tsconfig.json'),
		JSON.stringify({
			compilerOptions: {
				target: 'ES2022',
				lib: ['ES2022', 'DOM', 'DOM.Iterable'],
				types: [],
				module: 'NodeNext',
				moduleResolution: 'NodeNext',
				jsx: 'preserve',
				jsxImportSource: '@exactjs/jsx',
				strict: true,
				skipLibCheck: true
			}
		})
	);
	return root;
}
