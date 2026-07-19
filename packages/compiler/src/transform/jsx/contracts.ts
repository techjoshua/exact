import type ts from 'typescript';

export type ComponentLocalInfo = { functions: Map<string, ts.Statement> };
export type DerivedReactiveEntry = {
	variableId: string;
	initializer: ts.Expression;
	cached: boolean;
};
export type DerivedReactiveIndex = {
	references: Map<string, DerivedReactiveEntry>;
	declarations: Map<string, DerivedReactiveEntry>;
};
