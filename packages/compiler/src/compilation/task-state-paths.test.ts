import { expect, it } from 'vitest';
import { transformSource } from './transformation.js';

it('allows literal dotted state in server-local setup while rejecting ambiguous transported patches', () => {
	const source = (
		interaction: boolean
	) => `import {TaskContext,type Component} from '@exactjs/core';
export function Page(this:Component<{'page.title':string}>){
this.state['page.title']='initial';
const run=async(task:TaskContext=TaskContext.server().blocking())=>{await Promise.resolve();this.state['page.title']='ready';};
${interaction ? '' : 'void run();'}
return ()=> <button ${interaction ? 'onClick={()=>run()}' : ''}>{this.state['page.title']}</button>;
}`;
	expect(() => transformSource(source(false), { target: 'server' })).not.toThrow();
	for (const target of ['client', 'server'] as const)
		expect(() => transformSource(source(true), { target })).toThrow('literal state key');
	expect(() => transformSource(source(false), { target: 'client' })).toThrow('literal state key');
});
