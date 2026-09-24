/** Selects acceptance for changes that can affect installed artifacts or the acceptance gate itself. */
export function needsPackedWorkbench(paths) {
	return paths.some((file) =>
		/^(?:packages\/|framework-adapters\/|react-adapters\/|plugins\/|component-libraries\/|native\/|scripts\/|\.github\/workflows\/|package(?:-lock)?\.json$|tsconfig[^/]*\.json$)/.test(
			file
		)
	);
}
