import ts from 'typescript';
import type { ExpressionType } from '../model.js';
import { ExclusiveTimer } from '../profiling.js';
import type { ProjectionCounters, TypeProjectionBucket } from './contracts.js';
import { type ExpressionDirectiveIndex, uniqueDirectives } from './directives.js';
import { ProjectType } from './projection-model.js';
import { isReadonlyArrayType } from './signatures.js';
import { displayFile, typeKind } from './syntax.js';

export type ExpressionTypeProjectionOptions = {
	filename: string;
	checker: ts.TypeChecker;
	detailedProfile: boolean;
	counters: ProjectionCounters;
	directives: ExpressionDirectiveIndex;
	typeHandles: WeakMap<ExpressionType, ts.Type>;
};

/** Builds cached, location-aware public type projections for one Program generation. */
export function createExpressionTypeProjection(options: ExpressionTypeProjectionOptions) {
	const { filename, checker, detailedProfile, counters: projectionCounters, directives } = options;
	const typeCache = new Map<ts.Type, ExpressionType>();
	const shallowTypeCache = new Map<ts.Type, Map<string, ExpressionType>>();
	// TypeScript formatting is location-sensitive. Keep exact-node variants
	// local to this projection so reuse is safe and no Program is retained.
	const shallowTypeLocationCache = new Map<ts.Type, Map<ts.Node, ExpressionType>>();
	const typeSummaryCache = new Map<ts.Type, Map<ts.Node, ExpressionType>>();
	const typeDisplayCache = new Map<ts.Type, Map<ts.Node, string>>();
	const signatureDisplayCache = new Map<ts.Signature, Map<ts.Node, string>>();
	// Source nodes are immutable for the lifetime of this Program generation.
	const typeProjectionTimer = new ExclusiveTimer<TypeProjectionBucket>(detailedProfile);
	const displayType = (type: ts.Type, at: ts.Node): string => {
		const locations = typeDisplayCache.get(type);
		const cached = locations?.get(at);
		if (cached !== undefined) return cached;
		const display = typeProjectionTimer.measure('display', () =>
			checker.typeToString(type, at, ts.TypeFormatFlags.NoTruncation)
		);
		const target = locations ?? new Map<ts.Node, string>();
		target.set(at, display);
		if (!locations) typeDisplayCache.set(type, target);
		return display;
	};
	const displaySignature = (signature: ts.Signature, at: ts.Node): string => {
		const locations = signatureDisplayCache.get(signature);
		const cached = locations?.get(at);
		if (cached !== undefined) return cached;
		const display = checker.signatureToString(signature, at, ts.TypeFormatFlags.NoTruncation);
		const target = locations ?? new Map<ts.Node, string>();
		target.set(at, display);
		if (!locations) signatureDisplayCache.set(signature, target);
		return display;
	};
	const typeFor = (type: ts.Type, at: ts.Node): ExpressionType => {
		const cached = typeCache.get(type);
		if (cached) {
			if (detailedProfile) projectionCounters.typeCacheHits++;
			return cached;
		}
		if (detailedProfile) projectionCounters.typeCacheMisses++;
		const display = displayType(type, at);
		const callSignatures = type.getCallSignatures();
		const key = `${filename}:${(type as ts.Type & { id?: number }).id ?? 'anonymous'}:${type.flags}:${display}`;
		// Install a cycle breaker before expanding recursive union members.
		const placeholder: ExpressionType = {
			id: `type:${key}`,
			kind: typeKind(type),
			display,
			nullable: false,
			callable: callSignatures.length > 0,
			properties: Object.freeze([]),
			propertyTypes: Object.freeze([]),
			unionMembers: Object.freeze([]),
			callSignatures: Object.freeze([]),
			typeArguments: Object.freeze([]),
			typeParameters: Object.freeze([])
		};
		typeCache.set(type, placeholder);
		const members = typeProjectionTimer.measure('members', () =>
			type.isUnionOrIntersection() ? type.types.map((member) => typeFor(member, at)) : []
		);
		const signatures = typeProjectionTimer.measure('signatures', () =>
			callSignatures.map((signature) => {
				const declaration = signature.getDeclaration() ?? at;
				return Object.freeze({
					display: displaySignature(signature, at),
					parameters: Object.freeze(
						signature.getParameters().map((parameter) => {
							const parameterDeclaration =
								parameter.valueDeclaration ?? parameter.declarations?.[0] ?? declaration;
							return Object.freeze({
								name: parameter.name,
								type: typeFor(
									checker.getTypeOfSymbolAtLocation(parameter, parameterDeclaration),
									parameterDeclaration
								),
								optional:
									Boolean(parameter.flags & ts.SymbolFlags.Optional) ||
									(ts.isParameter(parameterDeclaration) &&
										(!!parameterDeclaration.questionToken || !!parameterDeclaration.initializer)),
								rest: ts.isParameter(parameterDeclaration) && !!parameterDeclaration.dotDotDotToken,
								directives: directives.for(parameterDeclaration)
							});
						})
					),
					returnType: typeFor(checker.getReturnTypeOfSignature(signature), declaration),
					typeParameters: Object.freeze(
						(signature.typeParameters ?? []).map((parameter) => displayType(parameter, declaration))
					),
					declarationSource: displayFile(declaration.getSourceFile().fileName),
					directives: directives.for(declaration),
					returnDirectives: directives.for(signature.getDeclaration()?.type)
				});
			})
		);
		const [typeArguments, typeParameters] = typeProjectionTimer.measure(
			'arguments',
			() =>
				[
					type.flags & ts.TypeFlags.Object &&
					(type as ts.ObjectType).objectFlags & ts.ObjectFlags.Reference
						? checker
								.getTypeArguments(type as ts.TypeReference)
								.map((argument) => typeFor(argument, at))
						: [],
					((type as ts.Type & { typeParameters?: readonly ts.Type[] }).typeParameters ?? []).map(
						(parameter) => checker.typeToString(parameter, at)
					)
				] as const
		);
		// Optional parameters are commonly represented as `Options | undefined`.
		// Surface the non-nullish object's properties on that union so callers do
		// not need to understand TypeScript's internal union representation.
		const [properties, propertyTypes] = typeProjectionTimer.measure('properties', () => {
			const properties = type.getNonNullableType().getProperties();
			return [
				properties,
				properties.map((property) => {
					const declaration = property.valueDeclaration ?? property.declarations?.[0] ?? at;
					return Object.freeze({
						name: property.name,
						type: shallowTypeFor(
							checker.getTypeOfSymbolAtLocation(property, declaration),
							declaration
						),
						optional: Boolean(property.flags & ts.SymbolFlags.Optional),
						readonly:
							property.declarations?.some(
								(candidate) =>
									ts.canHaveModifiers(candidate) &&
									ts
										.getModifiers(candidate)
										?.some((modifier) => modifier.kind === ts.SyntaxKind.ReadonlyKeyword)
							) ?? false,
						directives: Object.freeze(
							uniqueDirectives(
								(property.declarations ?? []).flatMap((declaration) => directives.for(declaration))
							)
						)
					});
				})
			] as const;
		});
		const typeDirectives = typeProjectionTimer.measure('directives', () =>
			directives.forType(type)
		);
		const value = typeProjectionTimer.measure(
			'construction',
			() =>
				new ProjectType(
					`type:${key}`,
					typeKind(type),
					display,
					Boolean(
						type.flags &
							(ts.TypeFlags.Null | ts.TypeFlags.Undefined | ts.TypeFlags.Any | ts.TypeFlags.Unknown)
					) || members.some((member) => member.nullable),
					callSignatures.length > 0,
					Object.freeze(properties.map((property) => property.name)),
					Object.freeze(propertyTypes),
					Object.freeze(members),
					Object.freeze(signatures),
					Object.freeze(typeArguments),
					Object.freeze(typeParameters),
					checker.isTupleType(type)
						? 'tuple'
						: checker.isArrayType(type)
							? 'array'
							: isReadonlyArrayType(checker, type)
								? 'readonly-array'
								: undefined,
					typeDirectives
				)
		);
		// Recursive members already reference the placeholder. Populate that
		// same identity rather than replacing it with a second object whose
		// recursive edges would remain permanently empty.
		typeProjectionTimer.measure('construction', () => {
			Object.assign(placeholder, value);
			Object.freeze(placeholder);
			options.typeHandles.set(placeholder, type);
		});
		return placeholder;
	};

	const summary = (value: ts.Type, location: ts.Node): ExpressionType => {
		const locations = typeSummaryCache.get(value);
		const cached = locations?.get(location);
		if (cached) return cached;
		const display = displayType(value, location);
		const callSignatures = value.getCallSignatures();
		const properties = value.getProperties();
		const result = typeProjectionTimer.measure('construction', () =>
			Object.freeze({
				id: `type-summary:${value.flags}:${display}`,
				kind: typeKind(value),
				display,
				nullable: Boolean(
					value.flags &
						(ts.TypeFlags.Null | ts.TypeFlags.Undefined | ts.TypeFlags.Any | ts.TypeFlags.Unknown)
				),
				callable: callSignatures.length > 0,
				properties: Object.freeze(properties.map((property) => property.name)),
				propertyTypes: Object.freeze([]),
				unionMembers: Object.freeze([]),
				callSignatures: Object.freeze([]),
				typeArguments: Object.freeze([]),
				typeParameters: Object.freeze([])
			})
		);
		const target = locations ?? new Map<ts.Node, ExpressionType>();
		target.set(location, result);
		if (!locations) typeSummaryCache.set(value, target);
		return result;
	};

	const shallowTypeFor = (type: ts.Type, at: ts.Node): ExpressionType => {
		const locations = shallowTypeLocationCache.get(type);
		const locationCached = locations?.get(at);
		if (locationCached) {
			if (detailedProfile) projectionCounters.shallowTypeCacheHits++;
			return locationCached;
		}
		const display = displayType(type, at);
		const variants = shallowTypeCache.get(type);
		const cached = variants?.get(display);
		if (cached) {
			if (detailedProfile) projectionCounters.shallowTypeCacheHits++;
			const target = locations ?? new Map<ts.Node, ExpressionType>();
			target.set(at, cached);
			if (!locations) shallowTypeLocationCache.set(type, target);
			return cached;
		}
		if (detailedProfile) projectionCounters.shallowTypeCacheMisses++;
		const callSignatures = type.getCallSignatures();
		const properties = type.getProperties();
		const members = typeProjectionTimer.measure('members', () =>
			type.isUnionOrIntersection() ? type.types.map((member) => summary(member, at)) : []
		);
		const signatures = typeProjectionTimer.measure('signatures', () =>
			callSignatures.map((signature) => {
				const declaration = signature.getDeclaration() ?? at;
				return Object.freeze({
					display: displaySignature(signature, at),
					parameters: Object.freeze(
						signature.getParameters().map((parameter) => {
							const parameterDeclaration =
								parameter.valueDeclaration ?? parameter.declarations?.[0] ?? declaration;
							return Object.freeze({
								name: parameter.name,
								type: summary(
									checker.getTypeOfSymbolAtLocation(parameter, parameterDeclaration),
									parameterDeclaration
								),
								optional: Boolean(parameter.flags & ts.SymbolFlags.Optional),
								rest: ts.isParameter(parameterDeclaration) && !!parameterDeclaration.dotDotDotToken,
								directives: directives.for(parameterDeclaration)
							});
						})
					),
					returnType: summary(checker.getReturnTypeOfSignature(signature), declaration),
					typeParameters: Object.freeze(
						(signature.typeParameters ?? []).map((parameter) => displayType(parameter, declaration))
					),
					declarationSource: displayFile(declaration.getSourceFile().fileName),
					directives: directives.for(declaration),
					returnDirectives: directives.for(signature.getDeclaration()?.type)
				});
			})
		);
		const value = typeProjectionTimer.measure('construction', () =>
			Object.freeze({
				id: `type-summary:${type.flags}:${display}`,
				kind: typeKind(type),
				display,
				nullable:
					Boolean(
						type.flags &
							(ts.TypeFlags.Null | ts.TypeFlags.Undefined | ts.TypeFlags.Any | ts.TypeFlags.Unknown)
					) || members.some((member) => member.nullable),
				callable: callSignatures.length > 0,
				properties: Object.freeze(properties.map((property) => property.name)),
				propertyTypes: Object.freeze([]),
				unionMembers: Object.freeze(members),
				callSignatures: Object.freeze(signatures),
				typeArguments: Object.freeze([]),
				typeParameters: Object.freeze([])
			})
		);
		const target = variants ?? new Map<string, ExpressionType>();
		target.set(display, value);
		if (!variants) shallowTypeCache.set(type, target);
		const locationTarget = locations ?? new Map<ts.Node, ExpressionType>();
		locationTarget.set(at, value);
		if (!locations) shallowTypeLocationCache.set(type, locationTarget);
		return value;
	};

	return {
		typeFor,
		shallowTypeFor,
		displayType,
		displaySignature,
		typeCache,
		shallowTypeCache,
		typeProjectionTimer
	};
}
