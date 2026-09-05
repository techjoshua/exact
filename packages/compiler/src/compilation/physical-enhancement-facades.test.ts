import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { exactEnhancementFacadeRequest } from './enhancement-facades.js';
import { materializeExactPhysicalEnhancementFacades } from './physical-enhancement-facades.js';

describe('physical enhancement facades', () => {
	it('rewrites generated imports to portable output-relative facades', () => {
		const root = mkdtempSync(path.join(tmpdir(), 'exact-enhancement-facade-'));
		const source = path.join(root, 'src');
		const provider = path.join(root, 'provider.js');
		const importer = path.join(source, 'component.tsx');
		const outputFile = path.join(root, 'dist', 'component.ts');
		mkdirSync(source, { recursive: true });
		writeFileSync(provider, 'export const message = {};\n');
		writeFileSync(importer, 'export {};\n');
		const enhancement = {
			identity: 'test',
			moduleSpecifier: provider,
			exportName: 'message'
		};
		const request = exactEnhancementFacadeRequest(enhancement);
		const result = materializeExactPhysicalEnhancementFacades(
			`import enhancement from ${JSON.stringify(request)};`,
			[enhancement],
			importer,
			path.join(root, 'dist'),
			undefined,
			outputFile
		);

		expect(result.code).toContain('./.exact/enhancements/');
		expect(result.code).not.toContain(JSON.stringify(result.facades[0]!.filename));
		expect(readFileSync(result.facades[0]!.filename, 'utf8')).toContain(JSON.stringify(provider));
	});
});
