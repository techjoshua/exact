import { expect, it, onTestFinished } from 'vitest';
import { createCompilerSession } from '../expression/session.js';
import { analyzeSource } from './source-analysis.js';
import { transformSource } from './transformation.js';
import {
	readExactArtifactComponentFacts,
	retainArtifactComponentFacts
} from './artifact-component-facts.js';

/** Each public SDK witness releases its native process even after an assertion fails. */
function ownedSession() {
	const session = createCompilerSession();
	onTestFinished(() => session.dispose());
	return session;
}

const source = `import {TaskContext,type Component} from '@exactjs/core';
export function View(this:Component<{value:string}>) {
 this.state.value='ready';
 async function load(task:TaskContext=TaskContext.server()) {return 'loaded';}
 return()=> <button onClick={async()=>{this.state.value=await load();}}>{this.state.value}</button>;
}`;

it('publishes rendering separately from server-task and client-event coordination', () => {
	const analysis = analyzeSource(source, {
		session: ownedSession(),
		filename: '/render-capability.tsx',
		serverComponents: true
	});
	const component = analysis.components.find((value) => value.name === 'View')!;
	expect(component.renderCapability).toEqual({ server: 'supported', client: 'supported' });
	expect(component.placement).toBe('isomorphic');
	expect(component.tasks).toContainEqual(expect.objectContaining({ placement: 'server' }));
});

it.each(['server', 'client'] as const)(
	'retains capability in %s artifact facts without changing coordination',
	(target) => {
		const result = transformSource(source, {
			session: ownedSession(),
			filename: '/render-capability.tsx',
			target,
			serverComponents: true
		});
		expect(result.componentBuild.components).toContainEqual(
			expect.objectContaining({
				placement: 'isomorphic',
				renderCapability: { server: 'supported', client: 'supported' }
			})
		);
		const retained = retainArtifactComponentFacts(result);
		expect(readExactArtifactComponentFacts(retained.code, '/retained.js')?.components).toEqual(
			result.componentBuild.components
		);
	}
);

it.each([
	{
		name: 'browser',
		expression: 'window.location.href',
		capability: { server: 'unsupported', client: 'supported' }
	},
	{ name: 'opaque', expression: 'foreign()', capability: { server: 'unknown', client: 'unknown' } },
	{
		name: 'server-and-opaque',
		expression: '__dirname+foreign()',
		capability: { server: 'unknown', client: 'unsupported' }
	}
] as const)(
	'preserves $name render inputs across public analysis and both fact projections',
	({ name, expression, capability }) => {
		const session = ownedSession();
		const input = `import{type Component}from'@exactjs/core';declare function foreign():string;
 export function View(this:Component<{base:string,value:string}>){this.state.base='';this.state.value=this.state.base+${expression};return()=> <output>{this.state.value}</output>;}`;
		const options = { filename: `/render-input-${name}.tsx`, session };
		expect(
			analyzeSource(input, options).components.find((value) => value.name === 'View')
				?.renderCapability
		).toEqual(capability);
		for (const target of ['server', 'client'] as const) {
			const result = transformSource(input, { ...options, target });
			expect(result.componentBuild.components).toContainEqual(
				expect.objectContaining({ renderCapability: capability })
			);
			expect(
				readExactArtifactComponentFacts(
					retainArtifactComponentFacts(result).code,
					'/retained-input.js'
				)?.components
			).toEqual(result.componentBuild.components);
		}
	}
);
