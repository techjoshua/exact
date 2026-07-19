import type {
	ExpressionNode,
	ExpressionScope,
	ExpressionType,
	ScopeKind,
	Variable
} from '../model.js';
import type { ModuleBuilder } from './module-builder.js';
import { indentLines, printNode } from './printing.js';
import { SyntheticScope, SyntheticVariable, syntheticNode } from './primitives.js';

export class BlockBuilder {
	private readonly statements: ExpressionNode[] = [];
	readonly scope: SyntheticScope;

	constructor(
		protected readonly module: ModuleBuilder,
		parent: ExpressionScope,
		kind: ScopeKind = 'block'
	) {
		this.scope = new SyntheticScope(kind, parent);
	}
	variable(
		name: string,
		initializer?: ExpressionNode,
		valueType?: ExpressionType,
		declaration: 'const' | 'let' = 'const'
	): Variable {
		const variable = new SyntheticVariable(
			name,
			declaration,
			this.scope,
			valueType ?? initializer?.type
		);
		this.scope.add(variable);
		const annotation = variable.type ? `: ${variable.type.display}` : '';
		const text = `${declaration} ${name}${annotation}${initializer ? ` = ${printNode(initializer)}` : ''};`;
		this.statements.push(
			syntheticNode(
				'VariableStatement',
				'statement',
				this.scope,
				text,
				initializer ? [initializer] : [],
				{ variable }
			)
		);
		return variable;
	}

	let(name: string, initializer?: ExpressionNode, valueType?: ExpressionType): Variable {
		return this.variable(name, initializer, valueType, 'let');
	}

	expression(expression: ExpressionNode): this {
		this.statements.push(
			syntheticNode('ExpressionStatement', 'statement', this.scope, `${printNode(expression)};`, [
				expression
			])
		);
		return this;
	}

	returns(expression?: ExpressionNode): this {
		this.statements.push(
			syntheticNode(
				'ReturnStatement',
				'statement',
				this.scope,
				`return${expression ? ` ${printNode(expression)}` : ''};`,
				expression ? [expression] : []
			)
		);
		return this;
	}

	throws(expression: ExpressionNode): this {
		this.statements.push(
			syntheticNode('ThrowStatement', 'statement', this.scope, `throw ${printNode(expression)};`, [
				expression
			])
		);
		return this;
	}

	if(
		condition: ExpressionNode,
		whenTrue: (block: BlockBuilder) => void,
		whenFalse?: (block: BlockBuilder) => void
	): this {
		const truthy = new BlockBuilder(this.module, this.scope);
		whenTrue(truthy);
		const falsy = whenFalse ? new BlockBuilder(this.module, this.scope) : undefined;
		whenFalse?.(falsy!);
		const children = [condition, ...truthy.nodes(), ...(falsy?.nodes() ?? [])];
		const alternate = falsy ? ` else ${falsy.printBlock()}` : '';
		this.statements.push(
			syntheticNode(
				'IfStatement',
				'statement',
				this.scope,
				`if (${printNode(condition)}) ${truthy.printBlock()}${alternate}`,
				children
			)
		);
		return this;
	}

	forOf(
		name: string,
		iterable: ExpressionNode,
		configure: (block: BlockBuilder, item: Variable) => void,
		valueType?: ExpressionType
	): this {
		const block = new BlockBuilder(this.module, this.scope);
		const item = new SyntheticVariable(name, 'const', block.scope, valueType);
		block.scope.add(item);
		configure(block, item);
		this.statements.push(
			syntheticNode(
				'ForOfStatement',
				'statement',
				this.scope,
				`for (const ${name} of ${printNode(iterable)}) ${block.printBlock()}`,
				[iterable, ...block.nodes()],
				{ variable: item }
			)
		);
		return this;
	}

	while(condition: ExpressionNode, configure: (block: BlockBuilder) => void): this {
		const block = new BlockBuilder(this.module, this.scope);
		configure(block);
		this.statements.push(
			syntheticNode(
				'WhileStatement',
				'statement',
				this.scope,
				`while (${printNode(condition)}) ${block.printBlock()}`,
				[condition, ...block.nodes()]
			)
		);
		return this;
	}

	break(): this {
		this.statements.push(syntheticNode('BreakStatement', 'statement', this.scope, 'break;'));
		return this;
	}
	continue(): this {
		this.statements.push(syntheticNode('ContinueStatement', 'statement', this.scope, 'continue;'));
		return this;
	}

	nodes(): readonly ExpressionNode[] {
		return Object.freeze([...this.statements]);
	}
	printBlock(indent = '  '): string {
		const body = this.statements
			.map((statement) => `${indent}${indentLines(printNode(statement), indent)}`)
			.join('\n');
		return `{${body ? `\n${body}\n` : ''}}`;
	}
}
