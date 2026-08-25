import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
	acceptedRepresentations,
	encodedRepresentation,
	staticContentType
} from './static-assets.js';

describe('production static assets', () => {
	it('prefers Brotli and respects explicit encoding quality', () => {
		expect(acceptedRepresentations('gzip, br')).toMatchObject([
			{ encoding: 'br' },
			{ encoding: 'gzip' }
		]);
		expect(acceptedRepresentations('br;q=0.2, gzip;q=0.8')).toMatchObject([
			{ encoding: 'gzip' },
			{ encoding: 'br' }
		]);
		expect(acceptedRepresentations('br;q=0, deflate')).toEqual([]);
	});

	it('selects an existing encoded sibling and otherwise preserves the source file', async () => {
		const directory = await mkdtemp(path.join(tmpdir(), 'exact-shipping-static-'));
		try {
			const source = path.join(directory, 'client.js');
			await writeFile(source, 'source');
			await writeFile(`${source}.gz`, 'gzip');
			expect(await encodedRepresentation(source, 'br, gzip')).toEqual({
				file: `${source}.gz`,
				encoding: 'gzip'
			});
			expect(await encodedRepresentation(source, 'identity')).toEqual({ file: source });
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});

	it('serves generated browser assets with their declared media types', () => {
		expect(staticContentType('client.css')).toBe('text/css; charset=utf-8');
		expect(staticContentType('client.js')).toBe('text/javascript; charset=utf-8');
		expect(staticContentType('us-states.svg')).toBe('image/svg+xml; charset=utf-8');
	});
});
