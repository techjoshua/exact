import type { Component } from '@exactjs/core';

type StructureState = { visible: boolean };
let mountedStructure: Component<StructureState> | undefined;

function ConditionalChild() {
	return () => <em data-role="conditional">visible</em>;
}

function ConditionalRange(this: Component<StructureState>) {
	mountedStructure = this;
	this.state.visible = true;
	return () => (
		<section data-scenario="structure">
			<span data-role="before">before</span>
			{this.state.visible ? <ConditionalChild /> : null}
			<span data-role="after">after</span>
		</section>
	);
}

/** Compiler-issued conditional structural root. */
export const structureRoot = <ConditionalRange />;

const columns = [
	{ name: 'first', values: [11, 21] },
	{ name: 'second', values: [12, 22] }
];
const rows = ['alpha', 'beta'];

function IndexedOuterList(
	this: Component<{}>,
	props: {
		attributes: Record<string, string>;
		rows: string[];
		columns: { name: string; values: number[] }[];
	}
) {
	return () => (
		<div {...props.attributes}>
			<table>
				<tbody>
					{props.rows.map((row, index) => (
						<tr key={row}>
							{props.columns.map((column) => (
								<td key={column.name}>{column.values[index]}</td>
							))}
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}

/** Repeated native-map render programs with a shared inner keyed collection. */
export const indexedOuterListRoot = (
	<IndexedOuterList attributes={{ 'data-layout': 'table' }} rows={rows} columns={columns} />
);

/** Reads the mounted conditional-range owner. */
export function structureOwner(): Component<StructureState> {
	if (!mountedStructure) throw new Error('Conditional structure scenario is not mounted');
	return mountedStructure;
}
