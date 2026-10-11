import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { buildDiagnosticFixture as build } from './compiler-diagnostic-build.js';
const workspace = fileURLToPath(new URL('../../', import.meta.url));

/** Static helper identity cannot erase return secrecy while proving reactive reevaluation. */
async function verifyCallableAliasSecretPolicy(
	adapter: 'vite' | 'webpack' | 'bun',
	root: string,
	mode: 'chain' | 'table'
) {
	const selection =
		mode === 'chain'
			? 'const first=read;const alias=first;'
			: "const table={read};const alias=table['read'] satisfies ()=>string;";
	for (const target of ['client', 'server'] as const) {
		for (const secret of [false, true]) {
			await writeFile(
				path.join(root, 'entry.tsx'),
				`${secret ? '/** @exact keep=secret */' : ''}const kept='configured';
export function Page(props:{suffix:string}){/** @exact pure */const read=()=>kept+props.suffix;
${selection}const value=alias();return()=> <p>{value}</p>;}`
			);
			let failure: unknown;
			try {
				await build(adapter, root, target);
			} catch (error) {
				failure = error;
			}
			if (secret)
				assert.ok(
					String(failure).includes('EXACT3020'),
					`${adapter}/${target} lost alias return secrecy: ${failure}`
				);
			else
				assert.equal(failure, undefined, `${adapter}/${target} rejected public alias: ${failure}`);
		}
	}
}

/** Each alias-policy witness owns a separate fixture and adapter build deadline. */
export async function verifyCompilerAliasPolicies(
	adapter: 'vite' | 'webpack' | 'bun',
	selection: 'chain' | 'table'
): Promise<void> {
	await mkdir(path.join(workspace, '.tmp'), { recursive: true });
	const root = await mkdtemp(path.join(workspace, '.tmp/alias-policy-adapter-'));
	try {
		await Promise.all([
			writeFile(
				path.join(root, 'package.json'),
				JSON.stringify({ name: '@fixture/callable-alias-policy', type: 'module', private: true })
			),
			writeFile(path.join(root, 'exact.config.mjs'), 'export default {};'),
			writeFile(
				path.join(root, 'tsconfig.json'),
				JSON.stringify({
					compilerOptions: {
						target: 'ESNext',
						module: 'ESNext',
						moduleResolution: 'Bundler',
						jsx: 'preserve',
						strict: true
					},
					include: ['*.tsx']
				})
			)
		]);
		await verifyCallableAliasSecretPolicy(adapter, root, selection);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
}
