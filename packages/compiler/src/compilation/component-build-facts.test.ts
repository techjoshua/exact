import { describe, expect, it } from 'vitest';
import { transformSource } from './transformation.js';

describe('@exactjs/compiler: component build facts', () => {
	it.each(['component', 'helper'])(
		'keeps compiler-owned JSX fragments out of %s authorization edges',
		(mode) => {
			const rendered = '<Region><Jsx.Fragment><Foreign /></Jsx.Fragment></Region>';
			const result = transformSource(
				`import { _ as Region } from '@exactjs/jsx';import * as Jsx from '@exactjs/jsx';import { _ as Foreign } from '@acme/regions';export function Page(){return ${mode === 'component' ? '()=> ' : ''}${rendered};}`,
				{ filename: '/app/fragment.tsx', target: 'server', preserveOrdinaryModules: true }
			);
			expect(
				result.componentBuild.componentImports.map((edge) => [
					edge.moduleSpecifier,
					edge.exportName
				])
			).toEqual([['@acme/regions', '_']]);
		}
	);
	it.each(['component', 'helper'])(
		'retains framework structural ownership in %s render facts',
		(mode) => {
			const result = transformSource(
				`import {Fragment as Group, Activity} from '@exactjs/core';import {Document} from '@exactjs/core/document';import {Fragment as Foreign} from '@acme/regions';export function Page(){return ${mode === 'component' ? '()=> ' : ''}<Document><Group><Activity mode="visible"><Foreign/></Activity></Group></Document>;}`,
				{ filename: '/app/structure.tsx', target: 'server', preserveOrdinaryModules: true }
			);
			expect(
				result.componentBuild.componentImports.map((edge) => [
					edge.moduleSpecifier,
					edge.exportName
				])
			).toEqual([['@acme/regions', 'Fragment']]);
		}
	);
	it('records component imports rendered by ordinary helpers while respecting lexical shadowing', () => {
		const result = transformSource(
			`import DefaultCard from '@acme/default';
import {Card as NamedCard, unused} from '@acme/cards';import * as Cards from '@acme/namespace';
export function helper(){return <main><DefaultCard/><NamedCard/><Cards.Card/></main>;}
export function shadow(NamedCard:typeof DefaultCard){return <NamedCard/>;}`,
			{ filename: '/app/helper.tsx', target: 'server', preserveOrdinaryModules: true }
		);
		expect(result.componentBuild.components).toEqual([]);
		expect(result.componentBuild.componentImports).toEqual([
			expect.objectContaining({
				moduleSpecifier: '@acme/default',
				exportName: 'default',
				reason: 'render'
			}),
			expect.objectContaining({
				moduleSpecifier: '@acme/cards',
				exportName: 'Card',
				reason: 'render'
			}),
			expect.objectContaining({
				moduleSpecifier: '@acme/namespace',
				exportName: 'Card',
				reason: 'render'
			})
		]);
	});
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

	it.each([
		['({ Card }) => Card', 'Card'],
		['module => module.Card', 'Card'],
		["module => module['Card']", 'Card'],
		['({default: Card}) => Card', 'default']
	])(
		'projects lazy registry import %s for target-local bundler selection',
		(selector, exported) => {
			const result = transformSource(
				`
				import {createComponentRegistry} from '@exactjs/core';
				const load = () => import('./Card.js').then(${selector});
				const View = createComponentRegistry(({ lazy }) => ({
					card: lazy(load)
				}));
				export const root = <View.card />;
			`,
				{ filename: '/app/Page.tsx' }
			);

			expect(result.componentBuild.componentImports).toEqual([
				expect.objectContaining({
					moduleSpecifier: './Card.js',
					exportName: exported,
					artifactTargets: ['client', 'server'],
					reason: 'registry'
				})
			]);
		}
	);
});
