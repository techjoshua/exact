import { describe, expect, it } from 'vitest';
import { transform } from '../index.js';
import { analyzeSource } from '../compilation/source-analysis.js';

describe('@exactjs/compiler: component values', () => {
	it('supports immutable local function-valued components', () => {
		const output = transform(
			`function App() {
        const Card = function Card(this: Component<{ title: string }>) {
          return () => <p>{this.state.title}</p>;
        };
        return () => <Card />;
      }`,
			{ filename: 'App.tsx' }
		);

		expect(output).toContain('const Card = function Card');
		expect(output).toContain('__exactVNode(Card, {})');
		expect(output).toMatch(/__exactDynamic\(\(\) => this\.state\.title, "x[A-Za-z0-9_-]{22}"\)/);
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
		expect(output).toContain('__exactVNode(Card, {})');
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

		expect(output).toContain('const View = __exactDerived(() => this.state.grid ? Grid : List);');
		expect(output).toContain('__exactDynamic(() => __exactVNode(View.get(), {}))');
		expect(app?.renderEdges.map((edge) => edge.tag)).toEqual(['Grid', 'List']);
	});

	it('rejects reassigned and arbitrary registry-selected component values', () => {
		expect(() =>
			transform(
				`function App() {
          let View = Grid;
          View = List;
          return () => <View />;
        }`,
				{ filename: 'App.tsx' }
			)
		).toThrow(/JSX tag View resolves to variable, not a runtime component/);

		expect(() =>
			transform(
				`function App(this: Component<{ kind: string }>) {
          const views = { grid: Grid, list: List };
          const View = views[this.state.kind];
          return () => <View />;
        }`,
				{ filename: 'App.tsx' }
			)
		).toThrow(/JSX tag View resolves to variable, not a runtime component/);
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
		expect(output).toMatch(/\[__exactComponentContract_\d+\]: \{\s*version: 2,\s*placement:/);
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
		expect(output).toContain('export function Badge');
	});
});
