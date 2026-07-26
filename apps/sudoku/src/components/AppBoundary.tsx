import {
	ErrorContext,
	createErrorContext,
	type Child,
	type Component,
	type ErrorReport
} from '@exactjs/core';

type AppBoundaryProps = {
	children?: Child | Child[];
};

type AppBoundaryState = {
	errors: ErrorReport[];
};

/** Contains application failures while preserving an actionable recovery surface. */
export function AppBoundary(this: Component<AppBoundaryState>, props: AppBoundaryProps) {
	this.state.errors = [];
	const errors = createErrorContext(this.state.errors);
	this.setContext(ErrorContext, errors);

	return () =>
		this.state.errors.length ? (
			<main className="fatal-shell" role="alert">
				<p className="eyebrow">Sudoku Atelier</p>
				<h1>The puzzle hit an unexpected snag.</h1>
				<p>Your locally saved game is still available.</p>
				<button type="button" onClick={() => errors.clearAll()}>
					Return to the board
				</button>
			</main>
		) : (
			props.children
		);
}
