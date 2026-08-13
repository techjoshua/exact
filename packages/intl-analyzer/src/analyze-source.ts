import type { AnalyzeIntlSourceOptions, IntlSourceAnalysis } from './analysis-contracts.js';
import { NativeIntlAnalyzer } from './native-analysis.js';

/** Analyzes one source module with a short-lived native session. Build hosts should reuse NativeIntlAnalyzer. */
export function analyzeIntlSource(
	source: string,
	options: AnalyzeIntlSourceOptions
): IntlSourceAnalysis {
	const analyzer = new NativeIntlAnalyzer();
	try {
		return analyzer.analyzeSource(source, options);
	} finally {
		analyzer.dispose();
	}
}
