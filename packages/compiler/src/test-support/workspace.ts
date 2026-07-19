import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { onTestFinished } from 'vitest';

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
