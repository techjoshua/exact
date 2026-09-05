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

	it('keeps unproven package component imports available to both artifacts', () => {
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
				artifactTargets: ['client', 'server'],
				reason: 'render'
			})
		]);
	});

	it('keeps package identity hints out of generated JavaScript', () => {
		const source = `
			import { Card } from '@acme/cards';
			export function Page() {
				return () => <Card />;
			}
		`;
		const ordinary = transformSource(source, { filename: '/app/Page.tsx' });
		const packaged = transformSource(source, {
			filename: '/app/Page.tsx',
			packageName: '@acme/application'
		});

		expect(packaged.code).toBe(ordinary.code);
		expect(packaged.componentBuild.packageName).toBe('@acme/application');
		expect(ordinary.componentBuild).not.toHaveProperty('packageName');
		expect(JSON.stringify(packaged.componentBuild)).not.toMatch(/trust|authoriz|marker/i);
	});

	it('projects lazy registry imports for target-local bundler selection', () => {
		const result = transformSource(
			`
				const View = createComponentRegistry(({ lazy }) => ({
					card: lazy(() => import('./Card.js').then(({ Card }) => Card))
				}));
				export const root = <View.card />;
			`,
			{ filename: '/app/Page.tsx' }
		);

		expect(result.componentBuild.componentImports).toEqual([
			expect.objectContaining({
				moduleSpecifier: './Card.js',
				exportName: 'Card',
				artifactTargets: ['client', 'server'],
				reason: 'registry'
			})
		]);
	});
});
