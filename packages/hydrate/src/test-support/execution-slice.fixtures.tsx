/** Compiler-issued island reserved for setup-slice contract injection. */
export function SetupSliceIsland() {
	return () => <span hidden />;
}

/** Compiler-issued island reserved for cyclic-plan rejection coverage. */
export function CyclicSliceIsland() {
	return () => <span hidden />;
}
