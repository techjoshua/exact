import type ts from 'typescript';

/** Defines the component local info type contract. */
export type ComponentLocalInfo = { functions: Map<string, ts.Statement> };
/** Defines the derived reactive entry type contract. */
export type DerivedReactiveEntry = {
	variableId: string;
	name: string;
	initializer: ts.Expression;
	cached: boolean;
};
/** Defines the derived reactive index type contract. */
export type DerivedReactiveIndex = {
	references: Map<string, DerivedReactiveEntry>;
	declarations: Map<string, DerivedReactiveEntry>;
};
