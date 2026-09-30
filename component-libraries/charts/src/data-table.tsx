import type { Component } from '@exactjs/core';
import type { PresentedChartTable } from './table-contracts.js';

/** Internal chart-owned accessible table, shared by both disclosure and inline presentation. */
export function ChartDataTable(
	this: Component<{}>,
	props: { readonly table: PresentedChartTable }
) {
	return () =>
		props.table.display === 'inline' ? (
			<div className="exact-chart__data-view">{tableContent(props.table)}</div>
		) : (
			<details className="exact-chart__data-view">
				<summary>{props.table.summary}</summary>
				{tableContent(props.table)}
			</details>
		);
}

/** Produces the same scoped headers and cells for either disclosure policy. */
function tableContent(table: PresentedChartTable) {
	return (
		<div className="exact-chart__table-scroll">
			<table>
				{table.caption !== undefined && <caption>{table.caption}</caption>}
				<thead>
					<tr>
						<th scope="col">{table.rowHeading}</th>
						{table.columns.map((column) => (
							<th scope="col" key={column.id}>
								{column.label}
							</th>
						))}
					</tr>
				</thead>
				<tbody>
					{table.rows.map((row) => (
						<tr key={row.id}>
							<th scope="row">{row.label}</th>
							{row.cells.map((cell) => (
								<td key={cell.id}>{cell.value}</td>
							))}
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}
