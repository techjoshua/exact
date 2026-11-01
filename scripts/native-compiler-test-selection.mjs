/** Selects bounded native tests without allowing partial validation to certify release artifacts. */
export function nativeCompilerTestSelection({ testPattern, packageOutput, collectCoverage, allTargets }) {
	if (testPattern !== undefined && (!testPattern || packageOutput || collectCoverage || allTargets)) {
		throw new Error('--test-pattern requires a nonempty pattern and cannot select packaging or coverage');
	}
	return {
		focused: testPattern !== undefined,
		args: testPattern === undefined ? [] : ['-count=1', '-run', testPattern]
	};
}
