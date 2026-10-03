/** Authored component task source and observable expectations for the shared regression journey. */
export interface TaskStateRegressionCase {
	name: string;
	work: string;
	expected: string;
	definitions?: string;
	setup?: string;
	extraState?: string;
	parameters?: string;
	targets?: readonly ('client' | 'server')[];
	policyAlias?: boolean;
	disposable?: boolean;
	accessor?: boolean;
	seed?: boolean;
	holdPath?: string;
	increments?: boolean;
	collection?: 'values' | 'lookup' | 'members';
}
