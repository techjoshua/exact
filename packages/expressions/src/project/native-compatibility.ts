import {
	SignatureKind,
	type Project as NativeProject,
	type Signature as NativeSignature,
	type Symbol as NativeSymbol,
	type Type as NativeType
} from '@typescript/native/unstable/sync';
import {
	SyntaxKind as NativeSyntaxKind,
	type Node as NativeNode
} from '@typescript/native/unstable/ast';
import ts from 'typescript';

/**
 * Adapts TypeScript 7's snapshot-local semantic values to eXact's existing
 * projection algorithm.
 *
 * Source nodes are TypeScript 7 native AST objects. TypeScript 6 is not used
 * to parse, bind, or check the native path; its types describe the temporary
 * inputs expected by the transitional shared projection. The values created by
 * this class never escape `@exactjs/expressions`.
 */
export class NativeProjectionCompatibility {
	readonly sourceFile: ts.SourceFile;
	readonly checker: ts.TypeChecker;
	private readonly nativeToProjectedType = new WeakMap<NativeType, ts.Type>();
	private readonly projectedToNativeType = new WeakMap<ts.Type, NativeType>();
	private readonly nativeToProjectedSymbol = new WeakMap<NativeSymbol, ts.Symbol>();
	private readonly projectedToNativeSymbol = new WeakMap<ts.Symbol, NativeSymbol>();
	private readonly nativeToProjectedSignature = new WeakMap<NativeSignature, ts.Signature>();
	private readonly projectedToNativeSignature = new WeakMap<ts.Signature, NativeSignature>();
	private readonly prefetchedTypes = new WeakMap<ts.Node, NativeType>();
	private readonly prefetchedSymbols = new WeakMap<ts.Node, NativeSymbol>();
	private readonly nativeToProjectedNode = new WeakMap<NativeNode, ts.Node>();
	private readonly projectedToNativeNode = new WeakMap<ts.Node, NativeNode>();

	constructor(
		private readonly project: NativeProject,
		sourceFile: NativeNode
	) {
		this.sourceFile = this.requireProjectedNode(sourceFile) as ts.SourceFile;
		this.prefetchSemantics(this.sourceFile);
		this.checker = this.createChecker();
	}

	/** Resolves a projected type back to its native handle for assignability. */
	nativeType(type: ts.Type): NativeType | undefined {
		return this.projectedToNativeType.get(type);
	}

	private prefetchSemantics(sourceFile: ts.SourceFile): void {
		const semanticNodes: ts.Node[] = [];
		const identifiers: ts.Node[] = [];
		const visit = (node: ts.Node): void => {
			if ((ts.isExpression(node) || ts.isTypeNode(node)) && !isUnsafeNativeTypeQueryNode(node))
				semanticNodes.push(node);
			if (ts.isIdentifier(node)) identifiers.push(node);
			node.forEachChild(visit);
		};
		visit(sourceFile);
		const types = this.project.checker.getTypeAtLocation(
			semanticNodes.map((node) => this.requireNativeNode(node))
		);
		const symbols = this.project.checker.getSymbolAtLocation(
			identifiers.map((node) => this.requireNativeNode(node))
		);
		semanticNodes.forEach((node, index) => {
			const type = types[index];
			if (type) this.prefetchedTypes.set(node, type);
		});
		identifiers.forEach((node, index) => {
			const symbol = symbols[index];
			if (symbol) this.prefetchedSymbols.set(node, symbol);
		});
	}

	private createChecker(): ts.TypeChecker {
		const native = this.project.checker;
		return {
			getTypeAtLocation: (node: ts.Node) =>
				isUnsafeNativeTypeQueryNode(node)
					? this.wrapType(native.getAnyType())
					: this.wrapType(
							this.prefetchedTypes.get(node) ??
								native.getTypeAtLocation(this.requireNativeNode(node))
						),
			getSymbolAtLocation: (node: ts.Node) =>
				this.wrapSymbol(
					this.prefetchedSymbols.get(node) ??
						native.getSymbolAtLocation(this.requireNativeNode(node))
				),
			getShorthandAssignmentValueSymbol: (node: ts.Node) =>
				this.wrapSymbol(native.getShorthandAssignmentValueSymbol(this.requireNativeNode(node))),
			getExportSpecifierLocalTargetSymbol: (node: ts.ExportSpecifier) =>
				this.wrapSymbol(native.getExportSpecifierLocalTargetSymbol(this.requireNativeNode(node))),
			getTypeOfSymbolAtLocation: (symbol: ts.Symbol, node: ts.Node) =>
				this.wrapType(
					native.getTypeOfSymbolAtLocation(
						this.requireNativeSymbol(symbol),
						this.requireNativeNode(node)
					)
				),
			getResolvedSignature: (node: ts.CallLikeExpression) =>
				this.wrapSignature(
					native.getResolvedSignature(this.requireNativeNode(node))
				) as ts.Signature,
			getContextualType: (node: ts.Expression) =>
				this.wrapOptionalType(native.getContextualType(this.requireNativeNode(node) as never)) as
					| ts.Type
					| undefined,
			getReturnTypeOfSignature: (signature: ts.Signature) =>
				this.wrapType(native.getReturnTypeOfSignature(this.requireNativeSignature(signature))),
			typeToString: (type: ts.Type, at?: ts.Node) =>
				native.typeToString(
					this.requireNativeType(type),
					at ? this.requireNativeNode(at) : undefined
				),
			signatureToString: (signature: ts.Signature, at?: ts.Node) =>
				this.displaySignature(
					this.requireNativeSignature(signature),
					at ? this.requireNativeNode(at) : undefined
				),
			getTypeArguments: (type: ts.TypeReference) =>
				native
					.getTypeArguments(this.requireNativeType(type) as never)
					.map((argument) => this.requireProjectedType(argument)),
			isTupleType: (type: ts.Type) => native.isTupleType(this.requireNativeType(type)),
			isArrayType: (type: ts.Type) => native.isArrayType(this.requireNativeType(type)),
			isTypeAssignableTo: (source: ts.Type, target: ts.Type) =>
				native.isTypeAssignableTo(this.requireNativeType(source), this.requireNativeType(target))
		} as unknown as ts.TypeChecker;
	}

	private displaySignature(signature: NativeSignature, at?: NativeNode): string {
		const parameters = signature.getParameters().map((parameter, index) => {
			const type = this.project.checker.getParameterType(signature, index);
			return `${parameter.name}: ${type ? this.project.checker.typeToString(type, at) : 'unknown'}`;
		});
		const returnType = this.project.checker.getReturnTypeOfSignature(signature);
		const typeParameters = signature.getTypeParameters();
		const generics = typeParameters.length
			? `<${typeParameters.map((type) => this.project.checker.typeToString(type, at)).join(', ')}>`
			: '';
		return `${generics}(${parameters.join(', ')}): ${
			returnType ? this.project.checker.typeToString(returnType, at) : 'unknown'
		}`;
	}

	private wrapOptionalType(type: NativeType | undefined): ts.Type | undefined {
		return type ? this.requireProjectedType(type) : undefined;
	}

	private wrapType(type: NativeType | undefined): ts.Type {
		return this.requireProjectedType(type ?? this.project.checker.getAnyType());
	}

	private requireProjectedType(type: NativeType): ts.Type {
		const cached = this.nativeToProjectedType.get(type);
		if (cached) return cached;
		const projected = {
			id: type.id,
			flags: type.flags,
			objectFlags: type.isObjectType() ? type.objectFlags : 0,
			getCallSignatures: () =>
				this.project.checker
					.getSignaturesOfType(type, SignatureKind.Call)
					.map((signature) => this.requireProjectedSignature(signature)),
			getProperties: () =>
				this.project.checker
					.getPropertiesOfType(type)
					.map((symbol) => this.requireProjectedSymbol(symbol)),
			getNonNullableType: () =>
				this.requireProjectedType(this.project.checker.getNonNullableType(type) ?? type),
			getSymbol: () => this.wrapSymbol(type.getSymbol()),
			isUnionOrIntersection: () => type.isUnionType() || type.isIntersectionType()
		} as unknown as ts.Type;
		this.nativeToProjectedType.set(type, projected);
		this.projectedToNativeType.set(projected, type);
		Object.defineProperties(projected, {
			symbol: { get: () => this.wrapSymbol(type.getSymbol()) },
			aliasSymbol: { get: () => this.wrapSymbol(type.getAliasSymbol()) },
			types: {
				get: () =>
					type.isUnionType() || type.isIntersectionType()
						? type.getTypes().map((member) => this.requireProjectedType(member))
						: undefined
			},
			typeParameters: {
				get: () =>
					type.isClassOrInterface()
						? type.getTypeParameters().map((parameter) => this.requireProjectedType(parameter))
						: []
			}
		});
		return projected;
	}

	private wrapSymbol(symbol: NativeSymbol | undefined): ts.Symbol | undefined {
		return symbol ? this.requireProjectedSymbol(symbol) : undefined;
	}

	private requireProjectedSymbol(symbol: NativeSymbol): ts.Symbol {
		const cached = this.nativeToProjectedSymbol.get(symbol);
		if (cached) return cached;
		const projected = {
			flags: symbol.flags,
			name: symbol.name,
			escapedName: symbol.escapedName
		} as unknown as ts.Symbol;
		this.nativeToProjectedSymbol.set(symbol, projected);
		this.projectedToNativeSymbol.set(projected, symbol);
		Object.defineProperties(projected, {
			declarations: {
				get: () =>
					symbol.declarations.flatMap((handle) => {
						const node = handle.resolve(this.project);
						return node ? [this.requireProjectedNode(node) as ts.Declaration] : [];
					})
			},
			valueDeclaration: {
				get: () => {
					const node = symbol.valueDeclaration?.resolve(this.project);
					return node ? (this.requireProjectedNode(node) as ts.Declaration) : undefined;
				}
			}
		});
		return projected;
	}

	private wrapSignature(signature: NativeSignature | undefined): ts.Signature | undefined {
		return signature ? this.requireProjectedSignature(signature) : undefined;
	}

	private requireProjectedSignature(signature: NativeSignature): ts.Signature {
		const cached = this.nativeToProjectedSignature.get(signature);
		if (cached) return cached;
		const projected = {
			getDeclaration: () => {
				const node = signature.declaration?.resolve(this.project);
				return node ? (this.requireProjectedNode(node) as ts.SignatureDeclaration) : undefined;
			},
			getParameters: () =>
				signature.getParameters().map((parameter) => this.requireProjectedSymbol(parameter))
		} as unknown as ts.Signature;
		this.nativeToProjectedSignature.set(signature, projected);
		this.projectedToNativeSignature.set(projected, signature);
		Object.defineProperty(projected, 'typeParameters', {
			get: () =>
				signature
					.getTypeParameters()
					.map((parameter) => this.requireProjectedType(parameter) as ts.TypeParameter)
		});
		return projected;
	}

	private requireNativeType(type: ts.Type): NativeType {
		const native = this.projectedToNativeType.get(type);
		if (!native) throw new Error('A type from outside the active native snapshot was used');
		return native;
	}

	private requireNativeNode(node: ts.Node): NativeNode {
		const native = this.projectedToNativeNode.get(node);
		if (!native) throw new Error('A syntax node from outside the active native snapshot was used');
		return native;
	}

	private requireProjectedNode(node: NativeNode): ts.Node {
		const cached = this.nativeToProjectedNode.get(node);
		if (cached) return cached;
		const projected = new Proxy(node, {
			get: (target, property) => {
				if (property === 'kind') return this.projectedSyntaxKind(target.kind);
				if (property === 'operator') {
					const value = Reflect.get(target, property);
					return typeof value === 'number' ? this.projectedSyntaxKind(value) : value;
				}
				if (property === 'parent')
					return target.parent ? this.requireProjectedNode(target.parent) : undefined;
				if (property === 'forEachChild')
					return (visitor: (child: ts.Node) => unknown) =>
						target.forEachChild((child) => visitor(this.requireProjectedNode(child)));
				if (property === 'getSourceFile')
					return () => this.requireProjectedNode(target.getSourceFile()) as ts.SourceFile;
				const value = Reflect.get(target, property);
				if (this.isNativeNode(value)) return this.requireProjectedNode(value);
				if (this.isNodeCollection(value))
					return [...value].map((child) =>
						this.isNativeNode(child) ? this.requireProjectedNode(child) : child
					);
				return typeof value === 'function' ? value.bind(target) : value;
			}
		}) as unknown as ts.Node;
		this.nativeToProjectedNode.set(node, projected);
		this.projectedToNativeNode.set(projected, node);
		return projected;
	}

	private projectedSyntaxKind(nativeKind: number): number {
		const name = NativeSyntaxKind[nativeKind];
		const projected = (ts.SyntaxKind as unknown as Record<string, number>)[name];
		return projected ?? nativeKind;
	}

	private isNativeNode(value: unknown): value is NativeNode {
		return (
			typeof value === 'object' &&
			value !== null &&
			typeof (value as Readonly<{ kind?: unknown }>).kind === 'number' &&
			typeof (value as Readonly<{ forEachChild?: unknown }>).forEachChild === 'function'
		);
	}

	private isNodeCollection(value: unknown): value is Iterable<unknown> {
		return (
			typeof value === 'object' &&
			value !== null &&
			typeof (value as Readonly<{ length?: unknown }>).length === 'number' &&
			Symbol.iterator in value
		);
	}

	private requireNativeSymbol(symbol: ts.Symbol): NativeSymbol {
		const native = this.projectedToNativeSymbol.get(symbol);
		if (!native) throw new Error('A symbol from outside the active native snapshot was used');
		return native;
	}

	private requireNativeSignature(signature: ts.Signature): NativeSignature {
		const native = this.projectedToNativeSignature.get(signature);
		if (!native) throw new Error('A signature from outside the active native snapshot was used');
		return native;
	}
}

function isUnsafeNativeTypeQueryNode(node: ts.Node): boolean {
	return ts.isArrayLiteralExpression(node);
}
