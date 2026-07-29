import { describe, expect, it } from 'vitest';

import { transform } from '../index.js';

describe('@exactjs/compiler: component registry diagnostics', () => {
	it('accepts a finite immutable module registry', () => {
		expect(() =>
			transform(
				`
					const Grid = () => <p>grid</p>;
					const Table = () => <p>table</p>;
					const loadTable = () =>
						import("./Table.js").then(({ Table }) => Table);
					const Widget = createComponentRegistry(({ lazy }) => ({
						grid: Grid,
						table: lazy(loadTable)
					}));
					function Dashboard() {
						return () => <Widget.grid />;
					}
				`,
				{ filename: 'Dashboard.tsx' }
			)
		).not.toThrow();
	});

	it('requires an immutable named module binding', () => {
		expect(() =>
			transform(
				`
					export default createComponentRegistry(() => ({ grid: Grid }));
				`,
				{ filename: 'Dashboard.tsx' }
			)
		).toThrow('immutable named module-level binding');

		expect(() =>
			transform(
				`
					let Widget = createComponentRegistry(() => ({ grid: Grid }));
				`,
				{ filename: 'Dashboard.tsx' }
			)
		).toThrow('immutable named module-level binding');

		expect(() =>
			transform(
				`
					function Grid() { return () => <p>grid</p>; }
					const Widget = createComponentRegistry(() => ({ grid: Grid }));
					Widget.grid = OtherGrid;
				`,
				{ filename: 'Dashboard.tsx' }
			)
		).toThrow('may not be reassigned or mutated');
	});

	it('rejects effectful, branching, and computed definitions', () => {
		expect(() =>
			transform(
				`
					const Widget = createComponentRegistry(() => {
						console.log("register");
						return { grid: Grid };
					});
				`,
				{ filename: 'Dashboard.tsx' }
			)
		).toThrow('directly return a finite object');

		expect(() =>
			transform(
				`
					const Widget = createComponentRegistry(() => ({
						grid: enabled() ? Grid : LegacyGrid
					}));
				`,
				{ filename: 'Dashboard.tsx' }
			)
		).toThrow('may not use runtime branching');

		expect(() =>
			transform(
				`
					const Widget = createComponentRegistry(() => ({
						[readKey()]: Grid
					}));
				`,
				{ filename: 'Dashboard.tsx' }
			)
		).toThrow('finite, non-computed keys');
	});

	it('rejects unsafe keys and an escaping lazy capability', () => {
		expect(() =>
			transform(
				`
					const Widget = createComponentRegistry(() => ({
						constructor: Grid
					}));
				`,
				{ filename: 'Dashboard.tsx' }
			)
		).toThrow('unsafe prototype key');

		expect(() =>
			transform(
				`
					const Widget = createComponentRegistry(({ lazy }) => ({
						grid: Grid,
						escaped: lazy
					}));
				`,
				{ filename: 'Dashboard.tsx' }
			)
		).toThrow('may not escape its definition callback');

		expect(() =>
			transform(
				`
					const path = "./Table.js";
					const Widget = createComponentRegistry(({ lazy }) => ({
						table: lazy(() => import(path).then(({ Table }) => Table))
					}));
				`,
				{ filename: 'Dashboard.tsx' }
			)
		).toThrow('must use one static import');
	});

	it('requires finite dynamic keys while accepting KeyOf and hasComponent narrowing', () => {
		expect(() =>
			transform(
				`
					function Grid() { return () => <p>grid</p>; }
					const Widget = createComponentRegistry(() => ({ grid: Grid }));
					function Dashboard(this: Component<{ key: string }>) {
						const Current = Widget[this.state.key];
						return () => <Current />;
					}
				`,
				{ filename: 'Dashboard.tsx' }
			)
		).toThrow('must be proven by KeyOf');

		expect(() =>
			transform(
				`
					function Grid() { return () => <p>grid</p>; }
					const Widget = createComponentRegistry(() => ({ grid: Grid }));
					function Dashboard(
						this: Component<{ key: KeyOf<typeof Widget> }>
					) {
						const Current = Widget[this.state.key];
						return () => <Current />;
					}
				`,
				{ filename: 'Dashboard.tsx' }
			)
		).not.toThrow();
	});
});
