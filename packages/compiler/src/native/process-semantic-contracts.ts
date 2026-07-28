/** Checker-resolved lexical declarations and references returned without exposing native symbols. */
export type NativeCompilerSemanticGraph = Readonly<{
	scopes: readonly Readonly<{
		id: string;
		parentId?: string;
		kind: 'module' | 'function' | 'block';
		nodeKind: string;
	}>[];
	declarations: readonly Readonly<{
		id: string;
		name: string;
		scopeId: string;
		kind: 'import' | 'function' | 'class' | 'variable' | 'parameter' | 'type' | 'interface';
		nodeStart: number;
		nodeEnd: number;
		moduleSpecifier?: string;
		importedName?: string;
		typeOnly?: boolean;
		exportedName?: string;
	}>[];
	references: readonly Readonly<{
		name: string;
		scopeId: string;
		source: 'local' | 'import' | 'global' | 'unresolved';
		nodeStart: number;
		nodeEnd: number;
		declarationId?: string;
		declarationKind?:
			| 'import'
			| 'function'
			| 'class'
			| 'variable'
			| 'parameter'
			| 'type'
			| 'interface';
		moduleSpecifier?: string;
		importedName?: string;
		typeOnly?: boolean;
		exportedName?: string;
	}>[];
	exports: readonly Readonly<{
		exportedName: string;
		localName?: string;
		importedName?: string;
		moduleSpecifier?: string;
		typeOnly?: boolean;
	}>[];
}>;
