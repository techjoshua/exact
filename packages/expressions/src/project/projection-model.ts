import type {
	ExpressionCallSignature,
	ExpressionDirective,
	ExpressionScope,
	ExpressionSymbol,
	ExpressionType,
	ExpressionTypeKind,
	ScopeKind,
	Variable
} from '../model.js';

/** Mutable scope accumulator that seals its public variable list after projection. */
export class ProjectScope implements ExpressionScope {
	private owned: Variable[] = [];
	private readonly members = new Set<Variable>();

	constructor(
		readonly id: string,
		readonly kind: ScopeKind,
		readonly parent?: ExpressionScope
	) {}

	/** Performs the variables domain operation for this project scope instance. */
	get variables(): readonly Variable[] {
		return this.owned;
	}

	/** Performs the add domain operation for this project scope instance. */
	add(variable: Variable): void {
		if (this.members.has(variable)) return;
		this.members.add(variable);
		this.owned.push(variable);
	}

	/** Performs the seal domain operation for this project scope instance. */
	seal(): void {
		Object.freeze(this.owned);
	}
}

/** Canonical variable projected from one TypeScript symbol identity. */
export class ProjectVariable implements Variable {
	readonly id: string;
	readonly name: string;
	readonly declarationKind: string;
	readonly scope: ExpressionScope;
	type?: ExpressionType;
	exported = false;
	importedFrom?: string;
	typeOnly = false;
	directives?: readonly ExpressionDirective[];

	constructor(
		readonly symbol: ExpressionSymbol,
		name: string,
		kind: string,
		scope: ExpressionScope,
		readonly mutable: boolean,
		readonly synthetic = false
	) {
		this.id = symbol.id;
		this.name = name;
		this.declarationKind = kind;
		this.scope = scope;
	}
}

/** Immutable public type projection detached from its TypeScript Program. */
export class ProjectType implements ExpressionType {
	constructor(
		readonly id: string,
		readonly kind: ExpressionTypeKind,
		readonly display: string,
		readonly nullable: boolean,
		readonly callable: boolean,
		readonly properties: readonly string[],
		readonly propertyTypes: ExpressionType['propertyTypes'],
		readonly unionMembers: readonly ExpressionType[],
		readonly callSignatures: readonly ExpressionCallSignature[],
		readonly typeArguments: readonly ExpressionType[],
		readonly typeParameters: readonly string[],
		readonly collectionKind?: 'array' | 'readonly-array' | 'tuple',
		readonly directives?: readonly ExpressionDirective[]
	) {
		Object.freeze(this);
	}
}
