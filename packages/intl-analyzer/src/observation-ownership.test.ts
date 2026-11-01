import { expect, it } from 'vitest';
import { analyzeIntlSource, type IntlSourceAnalysis } from './index.js';
import type { IntlRuntimeDescriptorV1 } from '@exactjs/intl';

it.each(['', 'export function Greeting(){return () => <p intl:message>Hello</p>;}'])(
	'returns ordinary native analysis observations for %s',
	(source) => {
		const result = analyzeIntlSource(source, {
			filename: '/src/Owned.tsx',
			owner: 'analyzer-observation',
			sourceLocale: 'en-US'
		});
		const alias: { code: string } = result;
		alias.code = 'observed source';
		expect(result.code).toBe('observed source');
		if (result.descriptors.length) {
			const descriptor: { owner: string } = result.descriptors[0]!;
			descriptor.owner = 'observed owner';
			expect(result.descriptors[0]!.owner).toBe('observed owner');
		}
		const descriptors: { length: number } = result.descriptors;
		descriptors.length = 0;
		expect(result.descriptors).toHaveLength(0);
	}
);

it('emits ordinary descriptor and companion observations', async () => {
	const result = analyzeIntlSource(
		'export function Greeting(){return () => <p intl:message>Hello</p>;}',
		{
			filename: '/src/Owned.tsx',
			owner: 'analyzer-companion-observation',
			sourceLocale: 'en-US',
			descriptorModuleId: 'virtual:owned'
		}
	);
	const companion = result.companions![0]!;
	const generated = (await import(
		'data:text/javascript,' + encodeURIComponent(companion.code)
	)) as { descriptors: readonly IntlRuntimeDescriptorV1[] };
	const descriptor: { owner: string } = generated.descriptors[0]!;
	descriptor.owner = 'observed owner';
	expect(generated.descriptors[0]!.owner).toBe('observed owner');
	const list: { length: number } = generated.descriptors;
	list.length = 0;
	expect(generated.descriptors).toHaveLength(0);
	const observation: { generation: number } = companion;
	observation.generation++;
	expect(companion.generation).toBe(1);
});

function checkReadonlyTypes(result: IntlSourceAnalysis) {
	// @ts-expect-error Public analysis fields retain TypeScript readonly diagnostics.
	result.code = 'changed';
	// @ts-expect-error Public descriptor lists retain TypeScript readonly diagnostics.
	result.descriptors.length = 0;
}
void checkReadonlyTypes;
