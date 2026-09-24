import { expect, it } from 'vitest';
import { transformSource } from './transformation.js';
import {
	readExactArtifactComponentFacts,
	retainArtifactComponentFacts
} from './artifact-component-facts.js';

it('retains relocated importer facts without changing executable mappings', () => {
	const original = transformSource(
		`import { Card } from './Card.js'; export function Page() { return () => <Card />; }`,
		{ filename: '/source/Page.tsx', target: 'server', sourceMap: true }
	);
	const linked = retainArtifactComponentFacts(original, {
		moduleAliases: { './Card.js': './Card.exact.server.js' }
	});
	expect(linked.map).toBe(original.map);
	expect(linked.code.startsWith(original.code)).toBe(true);
	const facts = readExactArtifactComponentFacts(linked.code, '/consumer/Page.exact.server.ts');
	expect(facts?.filename).toBe('/consumer/Page.exact.server.ts');
	expect(facts?.componentImports).toEqual([
		expect.objectContaining({
			moduleSpecifier: './Card.exact.server.js',
			exportName: 'Card',
			artifactTargets: expect.arrayContaining(['server'])
		})
	]);
	const replaced = retainArtifactComponentFacts(original, {
		replacements: [
			{
				sourceModule: './Card.js',
				sourceExport: 'Card',
				targetModule: '@ui/card',
				targetExport: 'DefaultCard'
			}
		]
	});
	expect(
		readExactArtifactComponentFacts(replaced.code, '/consumer/page.ts')?.componentImports[0]
	).toMatchObject({ moduleSpecifier: '@ui/card', exportName: 'DefaultCard' });
});

it('rejects malformed and duplicate marked facts while ignoring ordinary source', () => {
	expect(readExactArtifactComponentFacts('export const value = 1;', '/app.ts')).toBeUndefined();
	const marker = '// exact:component-build/1 ';
	expect(() =>
		readExactArtifactComponentFacts('// exact:component-build/2 abc', '/app.ts')
	).toThrow(/Unsupported/);
	for (const value of [
		null,
		{ protocol: 2 },
		{ protocol: 1, components: [], componentImports: [{}], rendererEnhancements: [] }
	]) {
		expect(() =>
			readExactArtifactComponentFacts(
				marker + Buffer.from(JSON.stringify(value)).toString('base64url'),
				'/app.ts'
			)
		).toThrow(/Invalid artifact/);
	}
	expect(() => readExactArtifactComponentFacts(marker + '!invalid', '/app.ts')).toThrow(
		/Malformed/
	);
	expect(() => readExactArtifactComponentFacts(marker + 'a\n' + marker + 'b', '/app.ts')).toThrow(
		/Duplicate/
	);
});
