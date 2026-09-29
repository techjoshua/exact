import { peek, type Component } from '@exactjs/core';

/** Exercises reactive native pattern selection alongside an intentional setup snapshot. */
export function DerivedPatternProbe(
	this: Component<{ values: string[]; record: { label?: string }; fallback: string; slot: string }>
) {
	this.state.values = ['a', 'b'];
	this.state.record = {};
	this.state.fallback = 'fallback';
	this.state.slot = 'left';
	const { [this.state.slot]: selected } = { left: 'L', right: 'R' } as Record<string, string>;
	const { rows: alias, ...metadata } = {
		rows: [...this.state.values],
		count: this.state.values.length
	};
	const [first, second = first, ...remaining] = this.state.values;
	const {
		nested: { label = this.state.fallback },
		copy = label
	}: { nested: { label?: string }; copy?: string } = { nested: this.state.record, copy: undefined };
	const { rows: snapshot } = peek(() => ({ rows: [...this.state.values] }));
	return () => (
		<section data-derived-pattern>
			<button
				onClick={() => {
					this.state.values = ['c', 'd', 'e'];
					this.state.fallback = 'next';
					this.state.slot = 'right';
				}}
			>
				Replace pattern
			</button>
			<button
				onClick={() => {
					this.state.record.label = 'actual';
				}}
			>
				Set label
			</button>
			<output>{`${alias.join(',')}:${metadata.count}|${first},${second}:${remaining.join(',')}|${label}:${copy}|${snapshot.join(',')}|${selected}`}</output>
		</section>
	);
}

/** Provides a compiled root for ordinary rendering and paired adoption. */
export function derivedPatternRoot() {
	return <DerivedPatternProbe />;
}
