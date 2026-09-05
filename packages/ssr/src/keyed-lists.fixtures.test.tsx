import type { Component } from '@exactjs/core';

const items = [
	{ id: 'a', label: 'A' },
	{ id: 'b', label: 'B' }
];

/** Compiler-backed keyed list with compiler-assigned range identity. */
export function KeyedList(this: Component<{}>) {
	return () => (
		<>
			{this.map(
				items,
				(item) => item.id,
				(item) => (
					<li>{item.label}</li>
				)
			)}
		</>
	);
}

/** Compiler-backed keyed list with an authored stable range name. */
export function NamedKeyedList(this: Component<{}>) {
	return () => (
		<>
			{this.map(
				items.slice(0, 1),
				(item) => item.id,
				(item) => (
					<li>{item.label}</li>
				),
				'tasks'
			)}
		</>
	);
}
