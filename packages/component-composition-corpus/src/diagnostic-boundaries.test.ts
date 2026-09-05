/** @vitest-environment node */
import { transformSource } from '@exactjs/compiler';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('composition corpus diagnostics and compatibility boundary', () => {
	it('rejects lexical component declarations without stable target-local identity', async () => {
		const { filename, source } = await diagnosticSource('lexical-component.tsx');
		expect(() => transformSource(source, { filename })).toThrow(
			'must be defined at module scope so every target can receive one stable compiled artifact'
		);
	});

	it('routes host-classified React values through only the explicit compatibility adapter', async () => {
		const { filename, source } = await diagnosticSource('react-compatibility.tsx');
		const result = transformSource(source, {
			filename,
			jsxInterop: {
				adapterModule: '@exactjs/react-compat/exact',
				adapterExport: 'adaptReactComponent',
				clientRendererModule: '@exactjs/react-dom-compat/client19',
				cacheKey: 'corpus:react-boundary',
				classify: ({ sourceModule }) => (sourceModule === 'react-widget' ? 'component' : 'unknown')
			}
		});

		expect(result.code).toContain('component: Widget');
		expect(result.code).toContain('@exactjs/react-compat/exact');
		expect(result.code).toContain('import "@exactjs/react-dom-compat/client19"');
		expect(result.code).not.toContain('createCompiledVNode');
	});
});

async function diagnosticSource(name: string) {
	const filename = fileURLToPath(new URL(`../test-support/diagnostics/${name}`, import.meta.url));
	return { filename, source: await readFile(filename, 'utf8') };
}
