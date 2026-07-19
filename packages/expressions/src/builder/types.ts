import type { ExpressionType, ExpressionTypeKind } from '../model.js';

/** Performs the synthetic type domain operation. */
export function syntheticType(kind: ExpressionTypeKind, display: string = kind): ExpressionType {
	return Object.freeze({
		id: `synthetic-type:${kind}:${display}`,
		kind,
		display,
		nullable: kind === 'null' || kind === 'undefined' || kind === 'unknown' || kind === 'any',
		callable: kind === 'function',
		properties: Object.freeze([]),
		propertyTypes: Object.freeze([]),
		unionMembers: Object.freeze([]),
		callSignatures: Object.freeze([]),
		typeArguments: Object.freeze([]),
		typeParameters: Object.freeze([])
	});
}

/** Defines the type builder class contract. */
export class TypeBuilder {
	/** Performs the any domain operation for this type builder instance. */
	any(): ExpressionType {
		return syntheticType('any');
	}
	/** Performs the unknown domain operation for this type builder instance. */
	unknown(): ExpressionType {
		return syntheticType('unknown');
	}
	/** Performs the never domain operation for this type builder instance. */
	never(): ExpressionType {
		return syntheticType('never');
	}
	/** Performs the void domain operation for this type builder instance. */
	void(): ExpressionType {
		return syntheticType('void');
	}
	/** Performs the boolean domain operation for this type builder instance. */
	boolean(): ExpressionType {
		return syntheticType('boolean');
	}
	/** Performs the number domain operation for this type builder instance. */
	number(): ExpressionType {
		return syntheticType('number');
	}
	/** Performs the bigint domain operation for this type builder instance. */
	bigint(): ExpressionType {
		return syntheticType('bigint');
	}
	/** Performs the string domain operation for this type builder instance. */
	string(): ExpressionType {
		return syntheticType('string');
	}
	/** Performs the object domain operation for this type builder instance. */
	object(display = 'object'): ExpressionType {
		return syntheticType('object', display);
	}
	/** Performs the named domain operation for this type builder instance. */
	named(display: string): ExpressionType {
		return syntheticType('object', display);
	}
	/** Performs the array domain operation for this type builder instance. */
	array(element: ExpressionType): ExpressionType {
		return syntheticType('object', `readonly ${element.display}[]`);
	}
	/** Performs the mutable array domain operation for this type builder instance. */
	mutableArray(element: ExpressionType): ExpressionType {
		return syntheticType('object', `${element.display}[]`);
	}
	/** Performs the generic domain operation for this type builder instance. */
	generic(name: string, ...arguments_: ExpressionType[]): ExpressionType {
		return syntheticType(
			'object',
			`${name}<${arguments_.map((argument) => argument.display).join(', ')}>`
		);
	}
	/** Performs the literal domain operation for this type builder instance. */
	literal(value: string | number | bigint | boolean): ExpressionType {
		const display =
			typeof value === 'string'
				? JSON.stringify(value)
				: typeof value === 'bigint'
					? `${value}n`
					: String(value);
		return syntheticType(typeof value as ExpressionTypeKind, display);
	}
	/** Performs the nullable domain operation for this type builder instance. */
	nullable(value: ExpressionType): ExpressionType {
		return this.union(value, syntheticType('null'));
	}
	/** Performs the function domain operation for this type builder instance. */
	function(parameters: readonly ExpressionType[], returns: ExpressionType): ExpressionType {
		const display = `(${parameters.map((parameter, index) => `arg${index}: ${parameter.display}`).join(', ')}) => ${returns.display}`;
		return Object.freeze({
			...syntheticType('function', display),
			callSignatures: Object.freeze([
				Object.freeze({
					display,
					parameters: Object.freeze(
						parameters.map((parameter, index) =>
							Object.freeze({ name: `arg${index}`, type: parameter, optional: false, rest: false })
						)
					),
					returnType: returns,
					typeParameters: Object.freeze([])
				})
			])
		});
	}
	/** Performs the union domain operation for this type builder instance. */
	union(...members: ExpressionType[]): ExpressionType {
		return Object.freeze({
			id: `synthetic-type:union:${members.map((member) => member.id).join('|')}`,
			kind: 'union' as const,
			display: members.map((member) => member.display).join(' | '),
			nullable: members.some((member) => member.nullable),
			callable: members.every((member) => member.callable),
			properties: Object.freeze([]),
			propertyTypes: Object.freeze([]),
			unionMembers: Object.freeze([...members]),
			callSignatures: Object.freeze([]),
			typeArguments: Object.freeze([]),
			typeParameters: Object.freeze([])
		});
	}
}
