/** Reports whether a source directory belongs to published production code. */
export function isProductionSourceDirectory(name) {
	return name !== 'test-support' && name !== '__tests__';
}

/** Reports whether a source file belongs to target-local package compilation. */
export function isProductionSourceFile(name, excludeFixtures) {
	return (
		/\.[cm]?[jt]sx?$/i.test(name) &&
		!/\.d\.[cm]?ts$/i.test(name) &&
		!/(?:^|\.)test\.[cm]?[jt]sx?$/i.test(name) &&
		(!excludeFixtures || !/(?:^|\.)fixtures?\.[cm]?[jt]sx?$/i.test(name))
	);
}
