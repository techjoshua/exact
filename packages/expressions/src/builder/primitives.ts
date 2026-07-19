import type {
	ExpressionNode,
	ExpressionScope,
	ExpressionSymbol,
	ExpressionType,
	ScopeKind,
	Variable
} from '../model.js';

let syntheticId = 1;

/** Defines the synthetic scope class contract. */
export class SyntheticScope implements ExpressionScope {
	readonly id = `synthetic-scope:${syntheticId++}`;
	private readonly owned: Variable[] = [];
	constructor(
		readonly kind: ScopeKind,
		readonly parent?: ExpressionScope
	) {}
	/** Performs the variables domain operation for this synthetic scope instance. */
	get variables(): readonly Variable[] {
		return this.owned;
	}
	/** Performs the add domain operation for this synthetic scope instance. */
	add(variable: Variable): void {
		if (this.owned.some((current) => current.name === variable.name))
			throw new Error(`Duplicate binding "${variable.name}"`);
		this.owned.push(variable);
	}
}

/** Defines the synthetic variable class contract. */
export class SyntheticVariable implements Variable {
	readonly id = `synthetic-variable:${syntheticId++}`;
	readonly synthetic = true;
	readonly symbol: ExpressionSymbol;
	readonly mutable: boolean;
	constructor(
		readonly name: string,
		readonly declarationKind: string,
		readonly scope: ExpressionScope,
		readonly type?: ExpressionType,
		readonly exported = false,
		readonly importedFrom?: string,
		readonly typeOnly = false
	) {
		this.symbol = Object.freeze({ id: this.id, name });
		this.mutable =
			declarationKind === 'let' ||
			declarationKind === 'var' ||
			declarationKind === 'parameter' ||
			declarationKind === 'property';
	}
}

/** Performs the synthetic node domain operation. */
export function syntheticNode(
	kind: string,
	category: ExpressionNode['category'],
	scope: ExpressionScope,
	generatedText: string,
	children: readonly ExpressionNode[] = [],
	extra: Partial<ExpressionNode> & Readonly<Record<string, unknown>> = {}
): ExpressionNode {
	return Object.freeze({
		id: `synthetic-node:${syntheticId++}`,
		kind,
		category,
		scope,
		synthetic: true,
		children: Object.freeze([...children]),
		generatedText,
		...extra
	});
}
