import type { Component } from '@exactjs/core';
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- Consumed by motion:* attributes.
import motion from '@exactjs/motion' with { type: 'exact-enhancement' };
import type { MotionEffect } from '@exactjs/motion';
import { SudokuContext } from '../context.js';
import type { Digit, GameMove, SudokuCell } from '../types.js';

type ExactLensProps = {
	open: boolean;
	cell: SudokuCell;
	candidates: Digit[];
	conflicts: number[];
	lastMove?: GameMove;
};

function lensTabChange(open: boolean): MotionEffect {
	return {
		keyframes: open
			? [{ right: '0' }, { right: 'var(--lens-width)' }]
			: [{ right: 'var(--lens-width)' }, { right: '0' }],
		options: { duration: 220, easing: 'ease-out' }
	};
}

function lensContentChange(open: boolean): MotionEffect {
	return {
		keyframes: open
			? [
					{ opacity: 0, transform: 'translateX(100%)' },
					{ opacity: 1, transform: 'translateX(0)' }
				]
			: [
					{ opacity: 1, transform: 'translateX(0)' },
					{ opacity: 0, transform: 'translateX(100%)' }
				],
		options: { duration: 220, easing: 'ease-out' }
	};
}

/** Makes the selected cell's observable state and derived work visible. */
export function ExactLens(this: Component<{}>, props: ExactLensProps) {
	const game = this.getContext(SudokuContext);

	return () => (
		<aside className="exact-lens" className:is-open={props.open} aria-label="eXact Lens">
			<button
				type="button"
				className="lens-tab"
				aria-expanded={props.open}
				onClick={() => game.toggleLens()}
				motion:change={lensTabChange(props.open)}
			>
				<span className="lens-pulse" aria-hidden="true" />
				eXact Lens
				<span aria-hidden="true">{props.open ? '›' : '‹'}</span>
			</button>
			<div
				className="lens-content"
				aria-hidden={!props.open}
				motion:change={lensContentChange(props.open)}
			>
				<header>
					<div>
						<p>Live component instance</p>
						<strong>
							Cell r{props.cell.row + 1}c{props.cell.column + 1}
						</strong>
					</div>
					<button
						type="button"
						className="lens-close"
						aria-label="Close eXact Lens"
						tabIndex={props.open ? 0 : -1}
						onClick={() => game.toggleLens()}
					>
						×
					</button>
				</header>
				<div className="lens-metrics">
					<div>
						<span>DOM identity</span>
						<strong>81 stable cells</strong>
					</div>
					<div>
						<span>Conflicts</span>
						<strong>{props.conflicts.length}</strong>
					</div>
				</div>
				<section>
					<h2>Derived candidates</h2>
					<div className="candidate-strip">
						{props.candidates.length ? props.candidates.map((digit) => <span>{digit}</span>) : '—'}
					</div>
				</section>
				<section>
					<h2>Selected state</h2>
					<pre>{cellSnapshot(props.cell)}</pre>
				</section>
				<section>
					<h2>Last transaction</h2>
					<p>
						{props.lastMove
							? `${props.lastMove.label} · ${props.lastMove.changes.length} cell ${
									props.lastMove.changes.length === 1 ? 'change' : 'changes'
								}`
							: 'Make a move to inspect it.'}
					</p>
				</section>
				<p className="lens-note">
					Rows, candidates and conflicts are derived. They are never copied into parallel state.
				</p>
			</div>
		</aside>
	);
}

function cellSnapshot(cell: SudokuCell): string {
	return [
		'{',
		`  value: ${cell.value ?? 'undefined'},`,
		`  notes: [${cell.notes.join(', ')}],`,
		`  given: ${cell.given}`,
		'}'
	].join('\n');
}
