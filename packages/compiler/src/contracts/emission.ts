import type ts from 'typescript';

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
	remove: string;
	arrayMutation: string;
};

export type StateSnapshotTree = Map<string, StateSnapshotTree | ts.Expression>;

export type ClientIslandElementNode = ts.JsxElement | ts.JsxSelfClosingElement;

export type ExportBinding = {
	exportedName: string;
	localName: string;
};

export type ClientIslandCaptures = {
	values: string[];
	functions: ts.Statement[];
	stateReads?: string[];
	serverSlotChildren?: boolean;
};
