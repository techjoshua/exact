import type ts from 'typescript';

/** Defines the helper names type contract. */
export type HelperNames = {
	element: string;
	fragment: string;
	expression: string;
	dynamic: string;
	derived: string;
	boundary: string;
	write: string;
	update: string;
	updateResult: string;
	abortOptions: string;
	taskSignal: string;
	taskTimeout: string;
	taskInterval: string;
	taskAnimationFrame: string;
	taskIdleCallback: string;
	taskObserver: string;
	taskFetch: string;
	taskResource: string;
	taskOptionsSignal: string;
	taskCombinedSignal: string;
	taskAwait: string;
	taskContinuation: string;
	dispatchContinuation: string;
	registerContinuationContexts: string;
	remove: string;
	arrayMutation: string;
};

/** Defines the state snapshot tree type contract. */
export type StateSnapshotTree = Map<string, StateSnapshotTree | ts.Expression>;

/** Defines the client island element node type contract. */
export type ClientIslandElementNode = ts.JsxElement | ts.JsxSelfClosingElement;

/** Defines the export binding type contract. */
export type ExportBinding = {
	exportedName: string;
	localName: string;
};

/** Defines the client island captures type contract. */
export type ClientIslandCaptures = {
	values: string[];
	functions: ts.Statement[];
	stateReads?: string[];
	serverSlotChildren?: boolean;
};
