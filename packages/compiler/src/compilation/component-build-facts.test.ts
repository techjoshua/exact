import { describe, expect, it } from 'vitest';
import { transformSource } from './transformation.js';

describe('@exactjs/compiler: component build facts', () => {
	it('projects imported render edges without making package trust decisions', () => {
		const result = transformSource(
			`
				import DefaultCard from '@acme/cards/default';
				import { Card as NamedCard } from '@acme/cards';

				export function Page() {
					return () => <main><DefaultCard /><NamedCard /></main>;
				}
			`,
			{ filename: '/app/Page.tsx', packageName: '@acme/app' }
		);

		expect(result.componentBuild).toMatchObject({
			protocol: 1,
			filename: '/app/Page.tsx',
			packageName: '@acme/app'
		});
		expect(result.componentBuild.components).toEqual([
			expect.objectContaining({
				id: expect.any(String),
				placement: 'isomorphic',
				artifactTargets: ['client', 'server']
			})
		]);
		expect(result.componentBuild.componentImports).toEqual([
			expect.objectContaining({
				moduleSpecifier: '@acme/cards/default',
				exportName: 'default',
				artifactTargets: ['client', 'server'],
				reason: 'render'
			}),
			expect.objectContaining({
				moduleSpecifier: '@acme/cards',
				exportName: 'Card',
				artifactTargets: ['client', 'server'],
				reason: 'render'
			})
		]);
	});

	it('keeps client-only component imports descriptive for bundlers to ignore on the server', () => {
		const result = transformSource(
			`
				import { Button } from '@acme/client-controls';
				export function Page() {
					return () => <Button onClick={() => console.log('click')} />;
				}
			`,
			{ filename: '/app/Page.tsx' }
		);

		expect(result.componentBuild.componentImports).toEqual([
			expect.objectContaining({
				moduleSpecifier: '@acme/client-controls',
				exportName: 'Button',
				artifactTargets: ['client'],
				reason: 'render'
			})
		]);
	});
});
