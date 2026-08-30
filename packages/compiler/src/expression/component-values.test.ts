import { describe, expect, it } from 'vitest';
import { transform } from '../index.js';
import { analyzeSource } from '../compilation/source-analysis.js';

describe('@exactjs/compiler: component values', () => {
	it('rejects nested durable function-valued components', () => {
		expect(() =>
			transform(
				`function App() {
        const Card = function Card(this: Component<{ title: string }>) {
          return () => <p>{this.state.title}</p>;
        };
        return () => <Card />;
      }`,
				{ filename: 'App.tsx' }
			)
		).toThrow('must be defined at module scope');
	});

	it('supports immutable aliases to known components', () => {
		const output = transform(
			`import { Card as ImportedCard } from "./Card.js";
      function App() {
        const Card = ImportedCard;
        return () => <Card />;
      }`,
			{ filename: 'App.tsx' }
		);

		expect(output).toContain('const Card = ImportedCard;');
		expect(output).toContain('__exactComponentReceipt(Card, {})');
		expect(output).not.toContain('createCompiledVNode');
	});

	it('lowers finite conditional components through a reactive slot', () => {
		const source = `
      function App(this: Component<{ grid: boolean }>) {
        const View = this.state.grid ? Grid : List;
        return () => <View />;
      }
      function Grid() { return () => <p>grid</p>; }
      function List() { return () => <p>list</p>; }
    `;
		const output = transform(source, { filename: 'App.tsx' });
		const app = analyzeSource(source, { filename: 'App.tsx' }).components.find(
			(component) => component.name === 'App'
		);

		expect(output).toContain(
			'const View = __exactDerived(() => __exactReadState(this.state, 0) as any ? Grid : List);'
		);
		expect(output).toContain('__exactDynamic(() => __exactComponentReceipt(View.get(), {}))');
		expect(app?.renderEdges.map((edge) => edge.tag)).toEqual(['Grid', 'List']);
	});

	it('warns and lowers reassigned or otherwise opaque component values', () => {
		const reassigned = transform(
			`function App() {
          let View = Grid;
          View = List;
          return () => <View />;
        }`,
			{ filename: 'App.tsx' }
		);
		expect(reassigned).toContain('createCompiledDynamicComponent');

		const indexed = transform(
			`function App(this: Component<{ kind: string }>) {
          const views = { grid: Grid, list: List };
          const View = views[this.state.kind];
          return () => <View />;
        }`,
			{ filename: 'App.tsx' }
		);
		expect(indexed).toContain('createCompiledDynamicComponent');
	});

	it('attaches target descriptors to top-level function-valued components', () => {
		const output = transform(
			`export const Card = (props: { title: string }) =>
        () => <button onClick={() => console.log(props.title)}>{props.title}</button>;`,
			{ filename: 'Card.tsx', target: 'client' }
		);

		expect(output).toContain('@exactjs/component-contract');
		expect(output).toContain('@exactjs/component');
		expect(output).toMatch(/\[Symbol\.for\("@exactjs\/component"\)\]: "[^"]+"/);
		expect(output).not.toContain('[Symbol.for("@exactjs/component")]: true');
		expect(output).toMatch(/\[__exactComponentContract_\d+\]: \{\s*version: 3,\s*placement:/);
		expect(output).toContain('__exactComponentImplementation');
		expect(output).toContain('Object.assign');
	});

	it('brands an isomorphic component even when it has no generated artifact entries', () => {
		const output = transform(
			`import type { Component } from '@exactjs/core';
			export function Badge(this: Component<{}>) {
				return () => <small>native</small>;
			}`,
			{ filename: 'Badge.tsx', target: 'client' }
		);

		expect(output).toContain('@exactjs/component');
		expect(output).toContain('Object.assign');
		expect(output).toContain('artifact:');
		expect(output).toContain('tasks: []');
		expect(output).not.toContain('@exactjs/core/runtime/tasks');
	});

	it('gives transparent component output one compiler-owned component range', () => {
		const output = transform(
			`export function Transparent(props: { children?: string }) {
				return () => props.children;
			}`,
			{ filename: 'Transparent.tsx' }
		);

		expect(output).toContain('createCompiledChildRangeReceipt');
		expect(output).not.toContain('createCompiledComponentOutput');
		expect(output).toContain('return () => __exactDynamic(() => __exactReadState(props, 0)');
		expect(output).toContain('abi: 1');

		const constant = transform('export function Empty() { return () => null; }', {
			filename: 'Empty.tsx'
		});
		expect(constant).toContain('abi: 1');
		expect(constant).not.toContain('createCompiledComponentOutput');
	});
});
