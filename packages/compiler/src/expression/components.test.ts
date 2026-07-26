import { describe, expect, it } from 'vitest';
import { buildExactProvenance } from '../provenance.js';
import { analyzeExpressionComponents } from './analysis.js';
import {
	createExpressionComponentBoundaries,
	createExpressionGeneratedServerSlotBoundaries,
	createExpressionRenderEdges
} from './boundaries.js';
import { analyzeExpressionJsx } from './jsx.js';
import { createExpressionComponents } from './manifest.js';
import { clearExpressionProjectCache, expressionModuleFor } from './session.js';
import { analyzeExpressionTasks } from './task-analysis.js';
import { analyzeExpressionWrites } from './writes.js';

describe('expression-backed component effects', () => {
	it('does not infer components from ordinary this-owned data or helper members', () => {
		clearExpressionProjectCache();
		const module = expressionModuleFor(
			'OrdinaryReceiver.ts',
			`
      function update(this: { state: { count: number }; log(value: unknown): void; ref: string }) {
        this.state.count++;
        this.log(this.ref);
      }
    `
		);
		const tasks = analyzeExpressionTasks(module);
		const jsx = analyzeExpressionJsx(module, buildExactProvenance(module), 'OrdinaryReceiver.ts');

		expect(analyzeExpressionComponents(module, jsx, tasks).sites.size).toBe(0);
		expect(analyzeExpressionWrites(module).sites.size).toBe(0);
	});

	it('indexes same-named components in distinct lexical scopes without overwriting either site', () => {
		clearExpressionProjectCache();
		const module = expressionModuleFor(
			'ScopedComponents.tsx',
			`
      function left() { function Card() { return () => <p>left</p>; } return Card; }
      function right() { function Card() { return () => <p>right</p>; } return Card; }
    `
		);
		const tasks = analyzeExpressionTasks(module);
		const jsx = analyzeExpressionJsx(module, buildExactProvenance(module), 'ScopedComponents.tsx');
		const plan = analyzeExpressionComponents(module, jsx, tasks);
		const cards = [...plan.sites.values()].filter((site) => site.name === 'Card');
		expect(cards).toHaveLength(2);
		expect(new Set(cards.map((site) => site.id)).size).toBe(2);
		expect(plan.sites.get('Card')).toBeUndefined();
	});

	it('classifies JSX, browser, server import, and task placement effects', () => {
		clearExpressionProjectCache();
		const module = expressionModuleFor(
			'ComponentEffects.tsx',
			`import { readFile } from "node:fs";
      function Mixed(this: Component<{ value: string }>) {
        this.task.client([], ({ signal }) => window.addEventListener("resize", () => {}, { signal }));
        this.getContext(Theme);
        this.setContext(dynamicToken(), "value");
        const server = readFile;
        return () => <button ref={this.ref()} onClick={() => console.log(window.innerWidth)}>{this.state.value}</button>;
      }`
		);
		const tasks = analyzeExpressionTasks(module);
		const jsx = analyzeExpressionJsx(module, buildExactProvenance(module), 'ComponentEffects.tsx');
		const plan = analyzeExpressionComponents(module, jsx, tasks);
		const site = plan.sites.get('Mixed')!;
		expect(site.clientEffects).toBe(true);
		expect(site.serverEffects).toBe(true);
		expect(site.splitBoundaries).toEqual(
			expect.arrayContaining(['event-handler', 'ref', 'browser:window', 'server-import:readFile'])
		);
		expect(site.browserGlobalsOutsideClientBoundary).toEqual([]);
		expect(site.contexts).toEqual(
			expect.arrayContaining([
				{ token: 'Theme', kind: 'read', confidence: 'exact' },
				{ token: 'unknown', kind: 'write', confidence: 'unknown' }
			])
		);
		expect(
			createExpressionComponents('ComponentEffects.tsx', plan, tasks, new Map())[0]
		).toMatchObject({
			name: 'Mixed',
			placement: 'isomorphic',
			clientIslandCount: 1,
			tasks: [expect.objectContaining({ placement: 'client', requestedPlacement: 'client' })]
		});
		const edges = createExpressionRenderEdges(
			'ComponentEffects.tsx',
			'Mixed',
			site.renders,
			new Map([['button', { name: 'button', placement: 'client' as const }]])
		);
		expect(edges).toEqual([]);
	});

	it('resolves canonical JSX render sites into stable component edges', () => {
		clearExpressionProjectCache();
		const module = expressionModuleFor(
			'RenderEdges.tsx',
			'function Parent() { return () => <section onClick={() => {}}><Child /></section>; } function Child() { return () => <p />; }'
		);
		const tasks = analyzeExpressionTasks(module);
		const jsx = analyzeExpressionJsx(module, buildExactProvenance(module), 'RenderEdges.tsx');
		const site = analyzeExpressionComponents(module, jsx, tasks).sites.get('Parent')!;
		const edges = createExpressionRenderEdges(
			'RenderEdges.tsx',
			'Parent',
			site.renders,
			new Map([
				[
					'Child',
					{
						name: 'Child',
						boundaryName: 'Child',
						placement: 'server' as const,
						componentId: 'child-id'
					}
				]
			])
		);
		expect(edges).toHaveLength(1);
		expect(edges[0]).toMatchObject({
			tag: 'Child',
			componentId: 'child-id',
			placement: 'server',
			index: 1
		});
		expect(edges[0]?.path).not.toBe('');
		const owner = {
			id: 'parent-id',
			name: 'Parent',
			placement: 'server' as const,
			subgraphPlacement: 'server' as const,
			exported: false,
			renderEdges: edges,
			clientIslandCount: 0,
			tasks: [],
			contexts: [],
			splitBoundaries: [],
			diagnostics: []
		};
		const boundaries = createExpressionComponentBoundaries(
			'RenderEdges.tsx',
			[owner],
			analyzeExpressionComponents(module, jsx, tasks),
			new Map([
				[
					'Child',
					{
						name: 'Child',
						boundaryName: 'Child',
						placement: 'client' as const,
						componentId: 'child-id'
					}
				]
			])
		);
		expect(boundaries).toEqual([
			expect.objectContaining({
				name: 'Child',
				ownerComponentId: 'parent-id',
				renderEdgeId: edges[0]?.id,
				kind: 'client-island'
			})
		]);
		expect(
			createExpressionGeneratedServerSlotBoundaries(
				'RenderEdges.tsx',
				[owner],
				analyzeExpressionComponents(module, jsx, tasks),
				new Map([['Child', { name: 'Child', placement: 'server' as const }]])
			)
		).toEqual([
			expect.objectContaining({ name: 'Parent_ExactClient_1:children', kind: 'server-slot' })
		]);
	});

	it('reports browser globals outside managed client regions', () => {
		clearExpressionProjectCache();
		const module = expressionModuleFor(
			'BrowserEffect.tsx',
			'function View() { const width = window.innerWidth; return () => <p>{width}</p>; }'
		);
		const tasks = analyzeExpressionTasks(module);
		const jsx = analyzeExpressionJsx(module, buildExactProvenance(module), 'BrowserEffect.tsx');
		expect(
			analyzeExpressionComponents(module, jsx, tasks).sites.get('View')
				?.browserGlobalsOutsideClientBoundary
		).toEqual(['window']);
	});

	it('does not classify member property names as browser globals', () => {
		clearExpressionProjectCache();
		const module = expressionModuleFor(
			'PlatformProperty.tsx',
			`function View(this: Component<{ history: string[]; location: string }>) {
				this.state.history = [];
				this.state.location = "board";
				return () => <p>{this.state.history.length}:{this.state.location}</p>;
			}`
		);
		const tasks = analyzeExpressionTasks(module);
		const jsx = analyzeExpressionJsx(module, buildExactProvenance(module), 'PlatformProperty.tsx');
		const site = analyzeExpressionComponents(module, jsx, tasks).sites.get('View')!;

		expect(site.browserGlobalsOutsideClientBoundary).toEqual([]);
		expect(site.splitBoundaries).not.toContain('browser:history');
		expect(site.splitBoundaries).not.toContain('browser:location');
	});

	it('owns client island counts and JSX binding diagnostics', () => {
		clearExpressionProjectCache();
		const module = expressionModuleFor(
			'ComponentDiagnostics.tsx',
			`
      import type { TypeWidget } from "./TypeWidget.js";
      const ValueWidget = () => null;
      function View() { return () => <section onClick={() => {}}>
        <button onClick={() => {}}>nested</button>
        <TypeWidget /><ValueWidget /><MissingWidget />
      </section>; }
    `
		);
		const tasks = analyzeExpressionTasks(module);
		const jsx = analyzeExpressionJsx(
			module,
			buildExactProvenance(module),
			'ComponentDiagnostics.tsx'
		);
		const site = analyzeExpressionComponents(module, jsx, tasks).sites.get('View')!;
		expect(site.clientIslandCount).toBe(1);
		expect(site.diagnostics).toEqual(
			expect.arrayContaining([
				'error: JSX tag TypeWidget resolves to a type-only import and cannot be rendered at runtime',
				'error: JSX tag MissingWidget is not defined as a runtime component'
			])
		);
		expect(site.diagnostics).not.toContain(
			'error: JSX tag ValueWidget resolves to variable, not a runtime component'
		);
	});

	it('plans transitive client-island captures and state snapshots from canonical dependencies', () => {
		clearExpressionProjectCache();
		const module = expressionModuleFor(
			'IslandCaptures.tsx',
			`
      function View(this: Component<{ title: string }>) {
        const prefix = "Title";
        const label = this.state.title;
        const format = () => prefix + label;
        const click = () => console.log(format());
        return () => <button onClick={click}>{label}</button>;
      }
    `
		);
		const provenance = buildExactProvenance(module);
		const tasks = analyzeExpressionTasks(module);
		const jsx = analyzeExpressionJsx(module, provenance, 'IslandCaptures.tsx');
		const site = analyzeExpressionComponents(
			module,
			jsx,
			tasks,
			provenance,
			analyzeExpressionWrites(module)
		).sites.get('View')!;

		expect(site.clientIslands).toEqual([
			expect.objectContaining({
				valueCaptures: ['label', 'prefix'],
				functionCaptures: ['click', 'format'],
				stateReads: ['title']
			})
		]);
	});
});
