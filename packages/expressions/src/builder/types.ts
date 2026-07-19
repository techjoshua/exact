import type { ExpressionType, ExpressionTypeKind } from '../model.js';

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

export class TypeBuilder {
	any(): ExpressionType {
		return syntheticType('any');
	}
	unknown(): ExpressionType {
		return syntheticType('unknown');
	}
	never(): ExpressionType {
		return syntheticType('never');
	}
	void(): ExpressionType {
		return syntheticType('void');
	}
	boolean(): ExpressionType {
		return syntheticType('boolean');
	}
	number(): ExpressionType {
		return syntheticType('number');
	}
	bigint(): ExpressionType {
		return syntheticType('bigint');
	}
	string(): ExpressionType {
		return syntheticType('string');
	}
	object(display = 'object'): ExpressionType {
		return syntheticType('object', display);
	}
	named(display: string): ExpressionType {
		return syntheticType('object', display);
	}
	array(element: ExpressionType): ExpressionType {
		return syntheticType('object', `readonly ${element.display}[]`);
	}
	mutableArray(element: ExpressionType): ExpressionType {
		return syntheticType('object', `${element.display}[]`);
	}
	generic(name: string, ...arguments_: ExpressionType[]): ExpressionType {
		return syntheticType(
			'object',
			`${name}<${arguments_.map((argument) => argument.display).join(', ')}>`
		);
	}
	literal(value: string | number | bigint | boolean): ExpressionType {
		const display =
			typeof value === 'string'
				? JSON.stringify(value)
				: typeof value === 'bigint'
					? `${value}n`
					: String(value);
		return syntheticType(typeof value as ExpressionTypeKind, display);
	}
	nullable(value: ExpressionType): ExpressionType {
		return this.union(value, syntheticType('null'));
	}
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
