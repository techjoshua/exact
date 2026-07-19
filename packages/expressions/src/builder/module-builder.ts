import type {
	ExpressionNode,
	ExpressionScope,
	ExpressionType,
	ExpressionTypeKind,
	Variable
} from '../model.js';
import { createModule, type UnboundModule } from '../module.js';
import { validateExpressionTree } from '../validation.js';
import { ClassBuilder } from './class.js';
import type { FunctionOptions, ImportOptions } from './contracts.js';
import { FunctionBuilder } from './function.js';
import { normalizeGenerated, printNode, safePropertyName } from './printing.js';
import { SyntheticScope, SyntheticVariable, syntheticNode } from './primitives.js';
import { TypeBuilder, syntheticType } from './types.js';

export class ModuleBuilder {
	readonly types = new TypeBuilder();
	readonly scope = new SyntheticScope('module');
	private readonly statements: ExpressionNode[] = [];

	constructor(readonly filename: string) {}

	variable(name: string, valueType?: ExpressionType): Variable {
		const variable = new SyntheticVariable(name, 'const', this.scope, valueType);
		this.scope.add(variable);
		return variable;
	}

	/** Declares a project- or lib-resolved symbol without emitting a declaration. */
	ambient(name: string, valueType?: ExpressionType): Variable {
		const variable = new SyntheticVariable(name, 'ambient', this.scope, valueType);
		this.scope.add(variable);
		return variable;
	}

	import(names: readonly string[], from: string, options: ImportOptions = {}): readonly Variable[] {
		const variables = names.map((importedName) => {
			const name = options.aliases?.[importedName] ?? importedName;
			const variable = new SyntheticVariable(
				name,
				'import',
				this.scope,
				undefined,
				false,
				from,
				options.typeOnly ?? false
			);
			this.scope.add(variable);
			return variable;
		});
		const bindings = names.map((name) =>
			options.aliases?.[name] ? `${name} as ${options.aliases[name]}` : name
		);
		this.statements.push(
			syntheticNode(
				'ImportDeclaration',
				'declaration',
				this.scope,
				`import${options.typeOnly ? ' type' : ''} { ${bindings.join(', ')} } from ${JSON.stringify(from)};`,
				[],
				{ name: from }
			)
		);
		return variables;
	}

	exportFunction(name: string, configure: (fn: FunctionBuilder) => void): this {
		return this.function(name, configure, { exported: true });
	}

	function(
		name: string,
		configure: (fn: FunctionBuilder) => void,
		options: FunctionOptions = {}
	): this {
		const variable = new SyntheticVariable(
			name,
			'function',
			this.scope,
			syntheticType('function', `typeof ${name}`),
			true
		);
		this.scope.add(variable);
		const fn = new FunctionBuilder(this, this.scope);
		configure(fn);
		this.statements.push(Object.freeze({ ...fn.build(name, options), variable }));
		return this;
	}

	exportClass(
		name: string,
		configure: (value: ClassBuilder) => void,
		extendsExpression?: ExpressionNode
	): this {
		const variable = new SyntheticVariable(
			name,
			'class',
			this.scope,
			syntheticType('function', `typeof ${name}`),
			true
		);
		this.scope.add(variable);
		const value = new ClassBuilder(this, this.scope);
		configure(value);
		this.statements.push(
			Object.freeze({ ...value.build(name, true, extendsExpression), variable })
		);
		return this;
	}

	exportConst(name: string, initializer: ExpressionNode, valueType?: ExpressionType): Variable {
		const variable = new SyntheticVariable(
			name,
			'const',
			this.scope,
			valueType ?? initializer.type,
			true
		);
		this.scope.add(variable);
		const annotation = valueType ? `: ${valueType.display}` : '';
		this.statements.push(
			syntheticNode(
				'VariableStatement',
				'declaration',
				this.scope,
				`export const ${name}${annotation} = ${printNode(initializer)};`,
				[initializer],
				{ name, variable }
			)
		);
		return variable;
	}

	literal(value: string | number | bigint | boolean | null | undefined): ExpressionNode {
		const valueType =
			value === null
				? syntheticType('null')
				: value === undefined
					? syntheticType('undefined')
					: syntheticType(typeof value as ExpressionTypeKind);
		const text =
			typeof value === 'string'
				? JSON.stringify(value)
				: typeof value === 'bigint'
					? `${value}n`
					: value === undefined
						? 'undefined'
						: String(value);
		return syntheticNode('LiteralExpression', 'expression', this.scope, text, [], {
			type: valueType,
			text
		});
	}

	reference(variable: Variable): ExpressionNode {
		return syntheticNode('Identifier', 'expression', variable.scope, variable.name, [], {
			name: variable.name,
			variable,
			type: variable.type
		});
	}

	thisValue(): ExpressionNode {
		return syntheticNode('ThisKeyword', 'expression', this.scope, 'this');
	}

	multiply(left: ExpressionNode, right: ExpressionNode): ExpressionNode {
		return this.binary(left, '*', right, this.types.number());
	}

	binary(
		left: ExpressionNode,
		operator: string,
		right: ExpressionNode,
		valueType?: ExpressionType
	): ExpressionNode {
		return syntheticNode(
			'BinaryExpression',
			'expression',
			this.scope,
			`${printNode(left)} ${operator} ${printNode(right)}`,
			[left, right],
			{ operator, type: valueType }
		);
	}

	member(target: ExpressionNode, name: string): ExpressionNode {
		return syntheticNode(
			'PropertyAccessExpression',
			'expression',
			this.scope,
			`${printNode(target)}.${name}`,
			[target],
			{ name }
		);
	}

	element(target: ExpressionNode, index: ExpressionNode): ExpressionNode {
		return syntheticNode(
			'ElementAccessExpression',
			'expression',
			this.scope,
			`${printNode(target)}[${printNode(index)}]`,
			[target, index]
		);
	}

	conditional(
		condition: ExpressionNode,
		whenTrue: ExpressionNode,
		whenFalse: ExpressionNode,
		valueType?: ExpressionType
	): ExpressionNode {
		return syntheticNode(
			'ConditionalExpression',
			'expression',
			this.scope,
			`${printNode(condition)} ? ${printNode(whenTrue)} : ${printNode(whenFalse)}`,
			[condition, whenTrue, whenFalse],
			{ type: valueType }
		);
	}

	unary(operator: string, operand: ExpressionNode, valueType?: ExpressionType): ExpressionNode {
		return syntheticNode(
			'PrefixUnaryExpression',
			'expression',
			this.scope,
			`${operator}${printNode(operand)}`,
			[operand],
			{ operator, type: valueType }
		);
	}

	assignment(target: ExpressionNode, value: ExpressionNode, operator = '='): ExpressionNode {
		return syntheticNode(
			'BinaryExpression',
			'expression',
			this.scope,
			`${printNode(target)} ${operator} ${printNode(value)}`,
			[target, value],
			{ operator, type: value.type }
		);
	}

	array(...items: ExpressionNode[]): ExpressionNode {
		return syntheticNode(
			'ArrayLiteralExpression',
			'expression',
			this.scope,
			`[${items.map(printNode).join(', ')}]`,
			items
		);
	}

	object(properties: Readonly<Record<string, ExpressionNode>>): ExpressionNode {
		const children = Object.values(properties);
		const text = `{ ${Object.entries(properties)
			.map(([name, value]) => `${safePropertyName(name)}: ${printNode(value)}`)
			.join(', ')} }`;
		return syntheticNode('ObjectLiteralExpression', 'expression', this.scope, text, children);
	}

	await(value: ExpressionNode): ExpressionNode {
		return syntheticNode('AwaitExpression', 'expression', this.scope, `await ${printNode(value)}`, [
			value
		]);
	}

	construct(target: ExpressionNode, ...args: ExpressionNode[]): ExpressionNode {
		return Object.freeze({
			...syntheticNode(
				'NewExpression',
				'expression',
				this.scope,
				`new ${printNode(target)}(${args.map(printNode).join(', ')})`,
				[target, ...args]
			),
			target,
			arguments: Object.freeze(args)
		});
	}

	arrow(
		configure: (fn: FunctionBuilder) => ExpressionNode | void,
		options: Omit<FunctionOptions, 'exported' | 'generator'> = {}
	): ExpressionNode {
		return this.arrowIn(this.scope, configure, options);
	}

	arrowIn(
		parent: ExpressionScope,
		configure: (fn: FunctionBuilder) => ExpressionNode | void,
		options: Omit<FunctionOptions, 'exported' | 'generator'> = {}
	): ExpressionNode {
		const fn = new FunctionBuilder(this, parent);
		const returned = configure(fn);
		if (returned) fn.returns(returned);
		const params = fn.scope.variables
			.filter((variable) => variable.declarationKind === 'parameter')
			.map((variable) => `${variable.name}${variable.type ? `: ${variable.type.display}` : ''}`)
			.join(', ');
		const returnType = options.returnType ? `: ${options.returnType.display}` : '';
		return syntheticNode(
			'ArrowFunction',
			'expression',
			fn.scope,
			`${options.async ? 'async ' : ''}(${params})${returnType} => ${fn.printBlock()}`,
			fn.nodes(),
			{
				parameters: Object.freeze(
					fn.scope.variables.filter((variable) => variable.declarationKind === 'parameter')
				),
				captures: Object.freeze([])
			}
		);
	}

	call(target: ExpressionNode, ...args: ExpressionNode[]): ExpressionNode {
		return Object.freeze({
			...syntheticNode(
				'CallExpression',
				'expression',
				this.scope,
				`${printNode(target)}(${args.map(printNode).join(', ')})`,
				[target, ...args]
			),
			target,
			arguments: Object.freeze(args)
		});
	}

	jsx(
		tag: string,
		props: Readonly<Record<string, ExpressionNode | string | boolean>> = {},
		...children: ExpressionNode[]
	): ExpressionNode {
		const attributes = Object.entries(props)
			.map(([name, value]) => {
				if (value === true) return name;
				if (value === false) return `${name}={false}`;
				if (typeof value === 'string') return `${name}=${JSON.stringify(value)}`;
				return `${name}={${printNode(value)}}`;
			})
			.join(' ');
		const open = attributes ? `<${tag} ${attributes}>` : `<${tag}>`;
		return syntheticNode(
			'JsxElement',
			'jsx',
			this.scope,
			`${open}${children.map(printNode).join('')}</${tag}>`,
			children,
			{ name: tag }
		);
	}

	build(): UnboundModule {
		const code = this.statements.map(printNode).join('\n');
		const root = syntheticNode('SourceFile', 'module', this.scope, code, this.statements);
		return createModule({
			filename: this.filename,
			source: '',
			root,
			state: 'unbound',
			diagnostics: validateExpressionTree(root, this.filename),
			emitGenerated: (options) => ({
				code: normalizeGenerated(code, options),
				...(options?.sourceMap
					? {
							map: {
								version: 3 as const,
								file: this.filename,
								sources: [this.filename],
								sourcesContent: [code],
								names: [],
								mappings: code
									.split('\n')
									.map(() => 'AAAA')
									.join(';')
							}
						}
					: {})
			})
		});
	}
}
