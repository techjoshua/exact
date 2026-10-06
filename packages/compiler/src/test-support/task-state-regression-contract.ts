/** Authored component task source and observable expectations for the shared regression journey. */
export interface TaskStateRegressionCase {
	/** Executes the same task contract through a named declaration. */
	functionDeclaration?: boolean;
	/** Keeps an ordinary function expression as the authored task definition. */
	functionExpression?: boolean;
	name: string;
	work: string;
	expected: string;
	/** Retains a helper at the render boundary while task work updates its input. */
	renderExpression?: string;
	definitions?: string;
	setup?: string;
	extraState?: string;
	parameters?: string;
	targets?: readonly ('client' | 'server')[];
	policyAlias?: boolean;
	disposable?: boolean;
	accessor?: boolean;
	seed?: boolean;
	/** Limits this source to setup ownership, excluding event invocation contracts. */
	setupOnly?: boolean;
	holdPath?: string;
	increments?: boolean;
	collection?: 'values' | 'lookup' | 'members';
}
