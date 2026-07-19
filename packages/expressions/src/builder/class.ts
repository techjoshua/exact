import type { ExpressionNode, ExpressionScope, ExpressionType, Variable } from '../model.js';
import type { MethodOptions, PropertyOptions } from './contracts.js';
import { FunctionBuilder } from './function.js';
import type { ModuleBuilder } from './module-builder.js';
import { indentLines, printNode } from './printing.js';
import { SyntheticScope, SyntheticVariable, syntheticNode } from './primitives.js';

export class ClassBuilder {
	readonly scope: SyntheticScope;
	private readonly members: ExpressionNode[] = [];

	constructor(
		private readonly module: ModuleBuilder,
		parent: ExpressionScope
	) {
		this.scope = new SyntheticScope('class', parent);
	}

	property(
		name: string,
		valueType?: ExpressionType,
		initializer?: ExpressionNode,
		options: PropertyOptions = {}
	): Variable {
		const variable = new SyntheticVariable(
			name,
			'property',
			this.scope,
			valueType ?? initializer?.type
		);
		this.scope.add(variable);
		const modifiers = `${options.access ? `${options.access} ` : ''}${options.static ? 'static ' : ''}${options.readonly ? 'readonly ' : ''}`;
		const annotation = valueType ? `: ${valueType.display}` : '';
		const text = `${modifiers}${name}${options.optional ? '?' : ''}${annotation}${initializer ? ` = ${printNode(initializer)}` : ''};`;
		this.members.push(
			syntheticNode(
				'PropertyDeclaration',
				'declaration',
				this.scope,
				text,
				initializer ? [initializer] : [],
				{ name, variable }
			)
		);
		return variable;
	}

	method(
		name: string,
		configure: (method: FunctionBuilder) => void,
		options: MethodOptions = {}
	): this {
		const method = new FunctionBuilder(this.module, this.scope);
		configure(method);
		const declaration = method.build(name, { ...options, exported: false });
		const functionText = printNode(declaration);
		const start = functionText.indexOf('function');
		const signature = functionText.slice(start + 'function'.length).trimStart();
		const modifiers = `${options.access ? `${options.access} ` : ''}${options.static ? 'static ' : ''}${options.async ? 'async ' : ''}`;
		const methodText = `${modifiers}${signature.replace(/^\*?\s*/, options.generator ? '*' : '')}`;
		this.members.push(
			syntheticNode('MethodDeclaration', 'declaration', method.scope, methodText, method.nodes(), {
				name,
				parameters: Object.freeze(
					method.scope.variables.filter((variable) => variable.declarationKind === 'parameter')
				),
				captures: Object.freeze([])
			})
		);
		return this;
	}

	build(name: string, exported: boolean, extendsExpression?: ExpressionNode): ExpressionNode {
		const extension = extendsExpression ? ` extends ${printNode(extendsExpression)}` : '';
		const body = this.members
			.map((member) => `  ${indentLines(printNode(member), '  ')}`)
			.join('\n');
		return syntheticNode(
			'ClassDeclaration',
			'declaration',
			this.scope,
			`${exported ? 'export ' : ''}class ${name}${extension} {${body ? `\n${body}\n` : ''}}`,
			this.members,
			{ name }
		);
	}
}
