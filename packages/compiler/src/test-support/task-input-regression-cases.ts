import type { TaskStateRegressionCase } from './task-state-regression-contract.js';

/** Distinguishes live task inputs, captured originals and invocation-owned helper views. */
export const taskInputRegressionCases: TaskStateRegressionCase[] = [
	{
		name: 'const helper property mutation preserves native invocation',
		targets: ['client'],
		definitions: 'const helper=Object.assign(()=>2,{label:0});',
		setup: 'const selected=helper;selected.label=1;',
		work: "this.state.trace=''+selected();",
		expected: '2'
	},
	{
		name: 'render helper overloads survive task projection',
		setup:
			'function read(value:number):number;function read(value:string):number;function read(value:number|string){return Number(value);}',
		work: "this.state.count=3;this.state.trace='3';",
		renderExpression: 'read(this.state.count)',
		expected: '3'
	},
	{
		name: 'captured original Map remains outside supplied view',
		targets: ['client'],
		setup: "const owner=this.state.lookup;const read=()=>owner.get('a')??0;",
		work: "this.state.lookup.set('a',3);this.state.trace=''+read();this.state.lookup.delete('a');",
		expected: '0'
	},
	...[
		[
			'Map',
			'lookup',
			'Map<string,number>',
			"owner.get('a')??0",
			"this.state.lookup.set('a',3);",
			'3'
		],
		['Set', 'members', 'Set<number>', 'owner.has(3)', 'this.state.members.add(3);', 'true'],
		['Array', 'values', 'number[]', 'owner[0]??0', 'this.state.values[0]=3;', '3']
	].map(([name, field, type, read, write, expected]) => ({
		name: `supplied ${name} helper view observes pending edits`,
		setup: `const read=(owner:${type})=>${read};`,
		work: `${write}this.state.trace=''+read(this.state.${field});`,
		expected
	})),
	{
		name: 'explicit reactive cell task input',
		targets: ['client'],
		setup: 'const cell=this.reactive(()=>this.state.count);',
		work: "this.state.trace=''+cell.get();",
		expected: '0'
	},
	{
		name: 'mutable ordinary helper alias',
		targets: ['client'],
		setup: 'const read=()=>1;let selected=read;selected=()=>2;',
		work: "this.state.trace=''+selected();",
		expected: '2'
	},
	{
		name: 'whole component helper read',
		targets: ['client'],
		setup: 'const read=(owner:{state:{count:number}})=>owner.state.count;',
		work: "this.state.trace=''+read(this);",
		expected: '0'
	},
	{
		name: 'whole component state helper read',
		targets: ['client'],
		setup: 'const read=(owner:{state:{count:number}})=>owner.state;',
		work: "this.state.trace=''+read(this).count;",
		expected: '0'
	}
];
