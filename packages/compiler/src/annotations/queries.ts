import type {
	ExpressionCallParameter,
	ExpressionDirective,
	ExpressionType,
	ExpressionTypeProperty,
	NodeRef
} from '@exactjs/expressions';
import type { ExactAnnotationKey, ExactKeepPolicy, ExactKeyContract } from '../annotations.js';

/** Performs the node width domain operation. */
export function nodeWidth(reference: NodeRef): number {
	const span = reference.node.span;
	return span ? span.end - span.start : Number.MAX_SAFE_INTEGER;
}

/** Performs the exact key contract domain operation. */
export function exactKeyContract(
	type: ExpressionType | undefined,
	local?: readonly ExpressionDirective[]
): ExactKeyContract | undefined {
	if (!type) return undefined;
	const direct = consistentExactDirective(local, 'key');
	if (direct === null) return undefined;
	if (direct?.value) return keyMemberContract(type, direct.value);
	if (type.kind === 'string') return { method: false, primitive: true };
	if (type.unionMembers.length) {
		const contracts = type.unionMembers.map((member) => exactKeyContract(member, local));
		const first = contracts[0];
		return first && contracts.every((contract) => sameKeyContract(first, contract))
			? first
			: undefined;
	}
	const typeDirective = consistentExactDirective(type.directives, 'key');
	if (typeDirective === null) return undefined;
	if (typeDirective?.value) return keyMemberContract(type, typeDirective.value);
	const annotated = type.propertyTypes.filter((property) =>
		hasExactDirective(property.directives, 'key')
	);
	if (annotated.length !== 1) return undefined;
	return propertyKeyContract(annotated[0]!);
}

/** Performs the exact cleanup domain operation. */
export function exactCleanup(type: ExpressionType | undefined): string | 'call' | undefined {
	if (!type) return undefined;
	if (type.unionMembers.length) {
		const values = type.unionMembers.map(exactCleanup);
		const first = values[0];
		return first && values.every((value) => value === first) ? first : undefined;
	}
	const directive = consistentExactDirective(type.directives, 'cleanup');
	if (directive === null) return undefined;
	if (directive?.value)
		return validCleanupMember(type, directive.value) ? directive.value : undefined;
	const methods = type.propertyTypes.filter((property) =>
		hasExactDirective(property.directives, 'cleanup')
	);
	if (methods.length === 1 && methods[0]!.type.callable) return methods[0]!.name;
	return hasExactDirective(type.directives, 'cleanup') && type.callable ? 'call' : undefined;
}

/** Performs the exact cleanup for call domain operation. */
export function exactCleanupForCall(call: NodeRef): string | undefined {
	const local = directInitializerDeclaration(call);
	const localDirective = exactDirective(local?.node.directives, 'cleanup');
	if (localDirective?.value)
		return validCleanupMember(call.type, localDirective.value) ? localDirective.value : undefined;
	if (localDirective && call.type?.callable) return 'call';
	const returned = exactDirective(call.node.resolvedSignature?.returnDirectives, 'cleanup');
	if (returned?.value)
		return validCleanupMember(call.type, returned.value) ? returned.value : undefined;
	if (returned && call.type?.callable) return 'call';
	return exactCleanup(call.type);
}

/** Performs the exact owns return domain operation. */
export function exactOwnsReturn(call: NodeRef): boolean {
	return (
		hasExactDirective(directInitializerDeclaration(call)?.node.directives, 'own') ||
		hasExactDirective(call.node.resolvedSignature?.returnDirectives, 'own') ||
		hasExactDirective(call.type?.directives, 'own')
	);
}

/** Performs the tracked parameter domain operation. */
export function trackedParameter(parameter: ExpressionCallParameter): boolean {
	return hasExactDirective(parameter.directives, 'track');
}

/** Performs the tracked callback arguments domain operation. */
export function trackedCallbackArguments(call: NodeRef): readonly NodeRef[] {
	const signature = call.node.resolvedSignature;
	if (!signature) return [];
	const callbacks: NodeRef[] = [];
	signature.parameters.forEach((parameter, index) => {
		const argument = call.arguments[index];
		if (!argument) return;
		if (trackedParameter(parameter)) callbacks.push(argument);
		for (const property of parameter.type.propertyTypes.filter((candidate) =>
			hasExactDirective(candidate.directives, 'track')
		)) {
			const assignment = argument
				.children()
				.first(
					(child) => child.node.kind === 'PropertyAssignment' && child.node.name === property.name
				);
			const callback = assignment?.children().toArray().at(-1);
			if (callback) callbacks.push(callback);
		}
	});
	return callbacks;
}

/** Performs the exact directive domain operation. */
export function exactDirective(
	values: readonly ExpressionDirective[] | undefined,
	key: ExactAnnotationKey
): ExpressionDirective | undefined {
	return values?.find((value) => value.namespace === 'exact' && value.key === key);
}

/** Reports whether exact directive. */
export function hasExactDirective(
	values: readonly ExpressionDirective[] | undefined,
	key: ExactAnnotationKey
): boolean {
	return exactDirective(values, key) !== undefined;
}

/** Performs the exact keep policy domain operation. */
export function exactKeepPolicy(
	values: readonly ExpressionDirective[] | undefined
): ExactKeepPolicy | undefined {
	const matches =
		values?.filter((value) => value.namespace === 'exact' && value.key === 'keep') ?? [];
	const policies = new Set(matches.map((value) => value.value).filter(isExactKeepPolicy));
	return policies.size === 1 ? [...policies][0] : undefined;
}

/** Reports whether exact keep policy. */
export function isExactKeepPolicy(value: string | undefined): value is ExactKeepPolicy {
	return value === 'server' || value === 'client' || value === 'secret';
}

function consistentExactDirective(
	values: readonly ExpressionDirective[] | undefined,
	key: ExactAnnotationKey
): ExpressionDirective | null | undefined {
	const matches = values?.filter((value) => value.namespace === 'exact' && value.key === key) ?? [];
	if (!matches.length) return undefined;
	const first = matches[0]!;
	return matches.every((value) => value.value === first.value) ? first : null;
}

function keyMemberContract(type: ExpressionType, member: string): ExactKeyContract | undefined {
	const property = type.propertyTypes.find((candidate) => candidate.name === member);
	return property ? propertyKeyContract(property) : undefined;
}

function propertyKeyContract(property: ExpressionTypeProperty): ExactKeyContract | undefined {
	if (property.type.callable) {
		const signatures = property.type.callSignatures;
		if (
			!signatures.length ||
			signatures.some((signature) =>
				signature.parameters.some((parameter) => !parameter.optional && !parameter.rest)
			)
		)
			return undefined;
		if (
			signatures.some(
				(signature) =>
					signature.returnType.kind !== 'string' &&
					(!signature.returnType.unionMembers.length ||
						!signature.returnType.unionMembers.every((member) => member.kind === 'string'))
			)
		)
			return undefined;
		return { member: property.name, method: true, primitive: false };
	}
	if (
		property.type.kind !== 'string' &&
		(!property.type.unionMembers.length ||
			!property.type.unionMembers.every((member) => member.kind === 'string'))
	)
		return undefined;
	return { member: property.name, method: false, primitive: false };
}

function sameKeyContract(left: ExactKeyContract, right: ExactKeyContract | undefined): boolean {
	return (
		!!right &&
		left.member === right.member &&
		left.method === right.method &&
		left.primitive === right.primitive
	);
}

function directInitializerDeclaration(call: NodeRef): NodeRef | undefined {
	const declaration = call.ancestors().ofKind('VariableDeclaration').first();
	if (!declaration) return undefined;
	return declaration.children().toArray().at(-1)?.node === call.node ? declaration : undefined;
}

function validCleanupMember(type: ExpressionType | undefined, member: string): boolean {
	if (!type) return false;
	if (type.unionMembers.length)
		return type.unionMembers.every((candidate) => validCleanupMember(candidate, member));
	return type.propertyTypes.some((property) => property.name === member && property.type.callable);
}

/** Runs declares cleanup with the supplied execution context. */
export function callDeclaresCleanup(call: NodeRef): boolean {
	const local = directInitializerDeclaration(call);
	return (
		hasExactDirective(local?.node.directives, 'cleanup') ||
		hasExactDirective(call.node.resolvedSignature?.returnDirectives, 'cleanup') ||
		typeDeclares(call.type, 'cleanup')
	);
}

function typeDeclares(type: ExpressionType | undefined, key: ExactAnnotationKey): boolean {
	if (!type) return false;
	return (
		hasExactDirective(type.directives, key) ||
		type.propertyTypes.some((property) => hasExactDirective(property.directives, key)) ||
		type.unionMembers.some((member) => typeDeclares(member, key))
	);
}

/** Reports whether standard disposable. */
export function isStandardDisposable(type: ExpressionType | undefined): boolean {
	if (!type) return false;
	return (
		/\b(?:Async)?Disposable\b/.test(type.display) ||
		type.properties.some((property) => /(?:async)?dispose/i.test(property)) ||
		type.unionMembers.some(isStandardDisposable)
	);
}

/** Performs the valid directive location domain operation. */
export function validDirectiveLocation(key: ExactAnnotationKey, reference: NodeRef): boolean {
	const kind = reference.node.kind;
	if (key === 'client' || key === 'server')
		return ['FunctionDeclaration', 'MethodDeclaration', 'MethodSignature', 'FunctionType'].includes(
			kind
		);
	if (key === 'keep')
		return [
			'VariableDeclaration',
			'Parameter',
			'PropertySignature',
			'PropertyDeclaration',
			'MethodSignature',
			'MethodDeclaration',
			'FunctionDeclaration',
			'FunctionType',
			'TypeReference',
			'ParenthesizedType',
			'TypeLiteral',
			'InterfaceDeclaration',
			'ClassDeclaration',
			'TypeAliasDeclaration'
		].includes(kind);
	if (key === 'key')
		return [
			'PropertySignature',
			'PropertyDeclaration',
			'MethodSignature',
			'MethodDeclaration',
			'InterfaceDeclaration',
			'ClassDeclaration',
			'TypeAliasDeclaration',
			'TypeLiteral',
			'VariableDeclaration'
		].includes(kind);
	if (key === 'cleanup')
		return [
			'PropertySignature',
			'PropertyDeclaration',
			'MethodSignature',
			'MethodDeclaration',
			'InterfaceDeclaration',
			'ClassDeclaration',
			'TypeAliasDeclaration',
			'TypeLiteral',
			'VariableDeclaration',
			'FunctionType',
			'ParenthesizedType',
			'TypeReference'
		].includes(kind);
	if (key === 'own')
		return [
			'VariableDeclaration',
			'TypeReference',
			'FunctionType',
			'ParenthesizedType',
			'TypeLiteral'
		].includes(kind);
	return ['Parameter', 'PropertySignature', 'PropertyDeclaration'].includes(kind);
}

/** Performs the directive location kind domain operation. */
export function directiveLocationKind(reference: NodeRef): string {
	return reference.node.kind === 'Identifier' && reference.parent?.node.kind === 'Parameter'
		? 'Parameter'
		: reference.node.kind;
}
