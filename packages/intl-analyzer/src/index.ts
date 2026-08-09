export { analyzeIntlSource } from './analyze-source.js';
export {
	createIntlExecutionContractHash,
	createIntlMessageKey,
	intlMessageNamePrefix
} from './message-key.js';
export { NativeIntlAnalyzer } from './native-analysis.js';
export { finalizeNativeIntlDescriptor } from './instrumentation.js';
export type {
	NativeIntlAnalysis,
	NativeIntlDescriptor,
	NativeIntlRegion,
	NativeIntlSpan
} from './native-analysis.js';
export type {
	AnalyzeIntlSourceOptions,
	IntlAnalysisDiagnostic,
	IntlDescriptorCompanion,
	IntlSourceAnalysis
} from './analysis-contracts.js';
export {
	childElement,
	childElements,
	localName,
	parseXml,
	requiredAttribute,
	requiredChild,
	type XmlElement
} from './xliff-xml.js';
