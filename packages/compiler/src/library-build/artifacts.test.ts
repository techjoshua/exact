import { expect, it, vi } from 'vitest';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createLibraryBuildFixture } from '../test-support/library-build.fixture.js';
import { withOwnedNativeCompilationSession } from '../compilation/native-session.js';
import { libraryArtifactProducts } from './artifacts.js';

it('keeps library registration analysis inside its generation owner', async () => {
	const { root } = await createLibraryBuildFixture();
	await withOwnedNativeCompilationSession(async (session) => {
		const requests = vi.spyOn(session, 'compileNative');
		const source =
			'export function Example(this:{state:{count:number}}){this.state.count=0;return()=> <button onClick={()=>this.state.count++}>{this.state.count}</button>; }';
		const filename = path.join(root, 'src/Example.tsx');
		await writeFile(filename, source);
		const products = libraryArtifactProducts(
			source,
			filename,
			root,
			'tsconfig.json',
			'dist/client/Example.js',
			'dist/server/Example.js',
			{ session }
		);
		expect(products?.build.clientRegistrations).toContainEqual(
			expect.objectContaining({ exportName: 'Example' })
		);
		expect(requests.mock.calls.some(([request]) => request.kind === 'analyze')).toBe(true);
	});
});
