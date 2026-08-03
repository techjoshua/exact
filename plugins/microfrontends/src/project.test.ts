import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { prepareExactRemoteArtifactBuild } from './project.js';

const roots: string[] = [];
const buildKey = '0123456789abcdef0123456789abcdef01234567';

afterEach(async () => {
	await Promise.all(
		roots.splice(0).map(async (root) => {
			const { rm } = await import('node:fs/promises');
			await rm(root, { recursive: true, force: true });
		})
	);
});

describe('microfrontend project preparation', () => {
	it('prepares consumer-only applications without invoking artifact compilation', async () => {
		const root = await applicationRoot({ name: '@company/shell' });

		const prepared = await prepareExactRemoteArtifactBuild({
			applicationRoot: root,
			buildKey,
			buildConfig: {
				exposes: [],
				providedPackages: [],
				remoteBindings: [['billing', { clientEntry: 'https://cdn.example.test/billing.js' }]]
			}
		});

		expect(prepared.artifactGraph).toBeUndefined();
		expect(prepared.hasRemoteBindings).toBe(true);
		expect(prepared.plan.providedBootstrapSource).toContain('https://cdn.example.test/billing.js');
	});

	it('rejects missing and nameless application manifests before producing artifacts', async () => {
		const missing = await mkdtemp(path.join(tmpdir(), 'exact-microfrontend-project-'));
		roots.push(missing);
		await expect(
			prepareExactRemoteArtifactBuild({
				applicationRoot: missing,
				buildKey,
				buildConfig: { exposes: [], providedPackages: [], remoteBindings: [] }
			})
		).rejects.toThrow('Unable to read the application package manifest');

		const nameless = await applicationRoot({});
		await expect(
			prepareExactRemoteArtifactBuild({
				applicationRoot: nameless,
				buildKey,
				buildConfig: { exposes: [], providedPackages: [], remoteBindings: [] }
			})
		).rejects.toThrow('require a package name');
	});

	it('rejects an invalid TypeScript project before compiling exposed roots', async () => {
		const root = await applicationRoot({ name: '@company/remote' });
		await writeFile(path.join(root, 'tsconfig.json'), '{ invalid json', 'utf8');

		await expect(
			prepareExactRemoteArtifactBuild({
				applicationRoot: root,
				buildKey,
				buildConfig: {
					exposes: [['./Area', { component: './src/Area.tsx' }]],
					providedPackages: [],
					remoteBindings: []
				}
			})
		).rejects.toThrow();
	});
});

async function applicationRoot(manifest: object): Promise<string> {
	const root = await mkdtemp(path.join(tmpdir(), 'exact-microfrontend-project-'));
	roots.push(root);
	await writeFile(path.join(root, 'package.json'), JSON.stringify(manifest), 'utf8');
	return root;
}
