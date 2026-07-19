import type { ExpressionNode, ExpressionScope, ExpressionType, Variable } from '../model.js';
import { BlockBuilder } from './block.js';
import type { FunctionOptions } from './contracts.js';
import type { ModuleBuilder } from './module-builder.js';
import { SyntheticVariable, syntheticNode } from './primitives.js';

/** Defines the function builder class contract. */
export class FunctionBuilder extends BlockBuilder {
	private readonly parameters: Variable[] = [];

	constructor(module: ModuleBuilder, parent: ExpressionScope) {
		super(module, parent, 'function');
	}

	/** Performs the parameter domain operation for this function builder instance. */
	parameter(name: string, valueType?: ExpressionType): Variable {
		const variable = new SyntheticVariable(name, 'parameter', this.scope, valueType);
		this.scope.add(variable);
		this.parameters.push(variable);
		return variable;
	}

	/** Performs the arrow domain operation for this function builder instance. */
	arrow(
		configure: (fn: FunctionBuilder) => ExpressionNode | void,
		options: Omit<FunctionOptions, 'exported' | 'generator'> = {}
	): ExpressionNode {
		return this.module.arrowIn(this.scope, configure, options);
	}

	/** Creates a build for this function builder instance. */
	build(name: string, options: FunctionOptions = {}): ExpressionNode {
		const params = this.parameters
			.map((variable) => `${variable.name}${variable.type ? `: ${variable.type.display}` : ''}`)
			.join(', ');
		const generics = options.typeParameters?.length ? `<${options.typeParameters.join(', ')}>` : '';
		const returnType = options.returnType ? `: ${options.returnType.display}` : '';
		const prefix = `${options.exported ? 'export ' : ''}${options.async ? 'async ' : ''}function${options.generator ? '*' : ''}`;
		return syntheticNode(
			'FunctionDeclaration',
			'declaration',
			this.scope,
			`${prefix} ${name}${generics}(${params})${returnType} ${this.printBlock()}`,
			this.nodes(),
			{
				name,
				parameters: Object.freeze([...this.parameters]),
				captures: Object.freeze([])
			}
		);
	}
}
