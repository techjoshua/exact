import {
	mkdtempSync,
	mkdirSync,
	readFileSync,
	rmSync,
	statSync,
	utimesSync,
	writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, onTestFinished } from 'vitest';
import {
	exactEnhancementFacadeRequest,
	readExactPhysicalEnhancementFacadeRequest
} from './enhancement-facades.js';
import { materializeExactPhysicalEnhancementFacades } from './physical-enhancement-facades.js';

describe('physical enhancement facades', () => {
	it('does not reinterpret ordinary modules and rejects malformed compiler requests', () => {
		expect(
			readExactPhysicalEnhancementFacadeRequest("export {default} from 'provider';")
		).toBeUndefined();
		expect(() =>
			readExactPhysicalEnhancementFacadeRequest('// exact:optional-enhancement/bad')
		).toThrow(/Malformed/);
	});
	it('rewrites generated imports to portable output-relative facades', () => {
		const root = mkdtempSync(path.join(tmpdir(), 'exact-enhancement-facade-'));
		onTestFinished(() => rmSync(root, { recursive: true, force: true }));
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

		expect(
			readExactPhysicalEnhancementFacadeRequest(readFileSync(result.facades[0]!.filename, 'utf8'))
		).toBe(request);
		expect(result.code).toContain('./.exact/enhancements/');
		expect(result.code).not.toContain(JSON.stringify(result.facades[0]!.filename));
		expect(readFileSync(result.facades[0]!.filename, 'utf8')).toContain(JSON.stringify(provider));
	});
	it('keeps unchanged facade timestamps stable and refreshes changed activation code', () => {
		const root = mkdtempSync(path.join(tmpdir(), 'exact-enhancement-watch-'));
		onTestFinished(() => rmSync(root, { recursive: true, force: true }));
		const importer = path.join(root, 'component.tsx');
		const enhancement = { identity: 'test', moduleSpecifier: './absent.js', exportName: 'message' };
		const emit = (activation?: string) =>
			materializeExactPhysicalEnhancementFacades(
				`import value from ${JSON.stringify(exactEnhancementFacadeRequest(enhancement))};`,
				[enhancement],
				importer,
				root,
				activation
			);
		const first = emit();
		const filename = first.facades[0]!.filename;
		const oldTime = new Date('2000-01-01T00:00:00Z');
		utimesSync(filename, oldTime, oldTime);
		expect(emit()).toEqual(first);
		expect(statSync(filename).mtimeMs).toBe(oldTime.getTime());
		emit('@fixture/activation');
		expect(readFileSync(filename, 'utf8')).toContain('@fixture/activation');
		expect(statSync(filename).mtimeMs).toBeGreaterThan(oldTime.getTime());
	});
});
