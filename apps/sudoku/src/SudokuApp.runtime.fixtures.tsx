import { TimeProvider, type TimeClock } from '@exactjs/time';
import { SudokuApp } from './SudokuApp.jsx';

/** Creates the compiler-owned root operation used by Sudoku runtime tests. */
export function createSudokuAppOperation() {
	return <SudokuApp />;
}

/** Creates the compiler-owned timed root operation used by Sudoku runtime tests. */
export function createTimedSudokuAppOperation(clock: TimeClock) {
	return (
		<TimeProvider clock={clock}>
			<SudokuApp />
		</TimeProvider>
	);
}
