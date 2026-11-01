/** Checks nearest root error reporting and replacement cleanup for real compiled components. */
export function verifyConstructionErrors(
	{ render, renderTestTree, unmount, componentOperation, defaultErrorContext },
	{ ConstructionErrorRoot, HealthyConstructionRoot, constructionError, constructionReleaseCount },
	document,
	nested = false,
	replacement = false
) {
	const container = document.createElement('main');
	const reports = [];
	const previousReports = defaultErrorContext.errors.length;
	const previousReleases = constructionReleaseCount();
	const options = { onErrorReport: (report) => reports.push(report) };
	try {
		if (replacement) render(componentOperation(HealthyConstructionRoot, {}), container, options);
		(nested ? renderTestTree : render)(
			componentOperation(ConstructionErrorRoot, {}),
			container,
			options
		);
		if (
			reports.length !== 1 ||
			reports[0].error !== constructionError ||
			reports[0].source !== 'construct'
		)
			throw new Error('Construction error did not reach its owning root report callback');
		if (defaultErrorContext.errors.length !== previousReports)
			throw new Error('Construction error escaped into the global fallback context');
		if (
			!container.textContent.includes('owned construction failure') ||
			container.textContent.includes('healthy')
		)
			throw new Error('Construction error did not replace the failed root output');
		if (constructionReleaseCount() !== previousReleases + Number(replacement))
			throw new Error('Construction replacement did not release its predecessor exactly once');
	} finally {
		unmount(container);
		for (const report of defaultErrorContext.errors.slice(previousReports))
			defaultErrorContext.clear(report);
	}
	if (
		container.childNodes.length ||
		constructionReleaseCount() !== previousReleases + Number(replacement)
	)
		throw new Error('Construction error teardown retained output or repeated predecessor cleanup');
	try {
		render(componentOperation(HealthyConstructionRoot, {}), container);
		if (container.textContent !== 'healthy')
			throw new Error('A construction failure prevented a later root from mounting');
	} finally {
		unmount(container);
	}
	if (constructionReleaseCount() !== previousReleases + Number(replacement) + 1)
		throw new Error('A later root did not release its lifecycle owner');
}
