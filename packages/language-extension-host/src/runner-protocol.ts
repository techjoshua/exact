import type {
	ExactLanguageAnalyzerCapability,
	ExactLanguageAnalyzerContext,
	ExactLanguageJsonValue
} from '@exactjs/language-extension-api';

/** Initialization frame sent before analyzer requests. */
export type ExactLanguageRunnerInitialize = Readonly<{
	protocol: 1;
	id: number;
	method: 'initialize';
	entry: string;
	context: ExactLanguageAnalyzerContext;
}>;

/** Request frame sent to the isolated analyzer runner. */
export type ExactLanguageRunnerRequest = Readonly<{
	protocol: 1;
	id: number;
	method: ExactLanguageAnalyzerCapability | 'invalidate' | 'shutdown';
	params?: ExactLanguageJsonValue;
}>;

/** Cancellation notification sent for a superseded request. */
export type ExactLanguageRunnerCancel = Readonly<{
	protocol: 1;
	method: 'cancel';
	requestId: number;
}>;

/** Response frame returned by the runner. */
export type ExactLanguageRunnerResponse = Readonly<{
	protocol: 1;
	id: number;
	result?: ExactLanguageJsonValue;
	error?: Readonly<{ message: string; stack?: string }>;
}>;
