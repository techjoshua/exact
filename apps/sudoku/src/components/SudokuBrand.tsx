import type { Component } from '@exactjs/core';

/** Renders the static application identity shared by the game shell. */
export function SudokuBrand(this: Component<{}>) {
	return () => (
		<a className="brand" href="/" aria-label="Sudoku Atelier home">
			<span className="brand-mark" aria-hidden="true">
				<span>9</span>
				<span>3</span>
				<span>6</span>
				<span>1</span>
			</span>
			<span>
				<strong>Sudoku Atelier</strong>
				<small>crafted with eXact</small>
			</span>
		</a>
	);
}
