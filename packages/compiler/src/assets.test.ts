import { describe, expect, it } from 'vitest';
import { analyzeSource, transform } from './index.js';

describe('asset imports and explicit import placement', () => {
	it('defaults side-effect stylesheet imports to client evaluation and delivery', () => {
		const source = `import "./app.scss"; export const ready = true;`;
		const analysis = analyzeSource(source, { filename: 'C:/src/app.ts' });

		expect(analysis.assets).toEqual([
			{
				specifier: './app.scss',
				kind: 'style',
				importMode: 'side-effect',
				evaluationTarget: 'client',
				deliveryTarget: 'client'
			}
		]);
		expect(transform(source, { filename: 'C:/src/app.ts', target: 'client' })).toContain(
			'./app.scss'
		);
		expect(transform(source, { filename: 'C:/src/app.ts', target: 'server' })).not.toContain(
			'./app.scss'
		);
		expect(
			transform(source, {
				filename: 'C:/src/app.ts',
				target: 'server',
				preserveClientAssetImports: true
			})
		).toContain('./app.scss');
	});

	it('keeps value-bearing style modules isomorphic while delivering them to the client', () => {
		const source = `import styles from "./app.css"; export const className = styles.root;`;
		const analysis = analyzeSource(source, { filename: 'C:/src/app.ts' });

		expect(analysis.assets[0]).toMatchObject({
			importMode: 'module',
			evaluationTarget: 'both',
			deliveryTarget: 'client'
		});
		expect(transform(source, { filename: 'C:/src/app.ts', target: 'server' })).toContain(
			'./app.css'
		);
	});

	it('consumes exact import attributes and lets them override placement', () => {
		const source = `import "./print.css" with { exact: "server" }; export const ready = true;`;
		const analysis = analyzeSource(source, { filename: 'C:/src/app.ts' });

		expect(analysis.assets[0]?.evaluationTarget).toBe('server');
		expect(transform(source, { filename: 'C:/src/app.ts', target: 'client' })).not.toContain(
			'print.css'
		);
		const server = transform(source, { filename: 'C:/src/app.ts', target: 'server' });
		expect(server).toContain('print.css');
		expect(server).not.toContain('exact:');
	});

	it('omits explicitly placed bound imports from the opposite artifact', () => {
		const source = `import { privateConfig } from "./config.js" with { exact: "server" }; export const config = privateConfig;`;

		const client = transform(source, { filename: 'C:/src/config.ts', target: 'client' });
		expect(client).not.toContain('./config.js');
		expect(client).not.toContain('privateConfig');
		const server = transform(source, { filename: 'C:/src/config.ts', target: 'server' });
		expect(server).toContain('./config.js');
		expect(server).not.toContain('exact:');
	});

	it('records adapter-defined asset types in the generic asset analysis', () => {
		const analysis = analyzeSource(`import poster from "./poster.avif?url"; export { poster };`, {
			filename: 'C:/src/media.ts',
			assetRules: [{ extensions: ['.avif'], queries: ['url'], kind: 'image', importMode: 'url' }]
		});

		expect(analysis.assets[0]).toMatchObject({
			specifier: './poster.avif?url',
			kind: 'image',
			importMode: 'url',
			evaluationTarget: 'both',
			deliveryTarget: 'client'
		});
	});
});
