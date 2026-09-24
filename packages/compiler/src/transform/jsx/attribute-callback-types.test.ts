import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, it } from 'vitest';
import { transformSource } from '../../compilation/transformation.js';
import { createTestWorkspace } from '../../test-support/workspace.js';

it.each(['value => value + suffix', 'function (value) { return value + suffix; }'])(
	'preserves contextual callback types in a materialized attribute: %s',
	async (callback) => {
		await mkdir(path.resolve('.tmp'), { recursive: true });
		const root = await createTestWorkspace('exact-attribute-types-', path.resolve('.tmp'));
		const configFile = path.join(root, 'tsconfig.json');
		await writeFile(
			configFile,
			JSON.stringify({
				compilerOptions: {
					strict: true,
					skipLibCheck: true,
					module: 'NodeNext',
					jsx: 'preserve',
					types: []
				}
			})
		);
		const source = `
			declare global { namespace JSX { interface IntrinsicElements {
				'custom-widget': { format: (value: string) => string };
			} } }
			export function View(props: { suffix: string }) {
				const suffix = props.suffix;
				return () => <custom-widget format={${callback}} />;
			}
		`;
		const options = {
			filename: path.join(root, 'view.tsx'),
			configFile,
			generatedValidation: 'semantic' as const
		};
		// Generated code must type-check after JSX contextual typing and derived locals disappear.
		const result = transformSource(source, options);
		expect(result.code).toContain('value: string');
		// An invalid use must not become accepted by widening the generated callback to any.
		expect(() =>
			transformSource(source.replace('value + suffix', 'value.toFixed() + suffix'), options)
		).toThrow(/toFixed/);
	}
);
