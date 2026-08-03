import { describe, expect, it } from 'vitest';

import { transform } from '../index.js';
import { analyzeSource } from '../compilation/source-analysis.js';

describe('@exactjs/compiler: component registries', () => {
	it('lowers static members and immutable aliases as component values', () => {
		const output = transform(
			`
				function Grid() { return () => <p>grid</p>; }
				const Widget = createComponentRegistry(() => ({ grid: Grid }));
				function Dashboard() {
					const GridAlias = Widget.grid;
					return () => <><Widget.grid /><GridAlias /></>;
				}
			`,
			{ filename: 'Dashboard.tsx' }
		);

		expect(output).toContain('__exactVNode(Widget.grid, {})');
		expect(output).toContain('__exactVNode(GridAlias, {})');
		expect(output).toContain('createCompiledComponentRegistry as __exactComponentRegistry');
		expect(output).toMatch(/__exactComponentRegistry\("x[^"]+", "Widget", \(\) => \(\{/);
	});

	it('turns reactive finite selection into a derived dynamic component range', () => {
		const output = transform(
			`
				function Grid() { return () => <p>grid</p>; }
				function Table() { return () => <p>table</p>; }
				const Widget = createComponentRegistry(() => ({ grid: Grid, table: Table }));
				function Dashboard(this: Component<{ selected: KeyOf<typeof Widget> }>) {
					const CurrentWidget = Widget[this.state.selected];
					return () => <CurrentWidget />;
				}
			`,
			{ filename: 'Dashboard.tsx' }
		);

		expect(output).toContain(
			'const CurrentWidget = __exactDerived(() => Widget[this.state.selected])'
		);
		expect(output).toContain('__exactDynamic(() => __exactVNode(CurrentWidget.get(), {}))');
	});

	it('retains scoped lazy registry members as opaque runtime component edges', () => {
		const source = `
				const Widget = createComponentRegistry(({ lazy }) => ({
					table: lazy(() => import("./Table.js").then(({ Table }) => Table))
				}));
				function Dashboard() {
					return () => <Widget.table />;
				}
			`;
		const output = transform(source, { filename: 'Dashboard.tsx' });
		const analysis = analyzeSource(source, { filename: 'Dashboard.tsx' });

		expect(output).toContain('__exactVNode(Widget.table, {})');
		expect(output).toContain('import("./Table.js")');
		expect(analysis.registries).toEqual([
			expect.objectContaining({
				name: 'Widget',
				entries: [
					expect.objectContaining({
						key: 'table',
						mode: 'lazy',
						moduleSpecifier: './Table.js',
						exportName: 'Table'
					})
				]
			})
		]);
	});
});
