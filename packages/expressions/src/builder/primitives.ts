import type {
	ExpressionNode,
	ExpressionScope,
	ExpressionSymbol,
	ExpressionType,
	ScopeKind,
	Variable
} from '../model.js';

let syntheticId = 1;

export class SyntheticScope implements ExpressionScope {
	readonly id = `synthetic-scope:${syntheticId++}`;
	private readonly owned: Variable[] = [];
	constructor(
		readonly kind: ScopeKind,
		readonly parent?: ExpressionScope
	) {}
	get variables(): readonly Variable[] {
		return this.owned;
	}
	add(variable: Variable): void {
		if (this.owned.some((current) => current.name === variable.name))
			throw new Error(`Duplicate binding "${variable.name}"`);
		this.owned.push(variable);
	}
}

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
