import {
	type PackageManifestLike,
	type ReactCompatReplacementDeclaration
} from '@exact/react-compat-adapter-api';

/** Defines the react compat package node interface contract. */
export interface ReactCompatPackageNode {
	readonly id: string;
	readonly location: string;
	readonly manifest: PackageManifestLike;
	readonly dependencies: readonly string[];
}

/** Defines the react compat package graph interface contract. */
export interface ReactCompatPackageGraph {
	readonly rootId: string;
	readonly nodes: ReadonlyMap<string, ReactCompatPackageNode>;
}

/** Defines the resolved react compat replacement interface contract. */
export interface ResolvedReactCompatReplacement extends ReactCompatReplacementDeclaration {
	readonly sourceInstance: string;
	readonly sourceLocation: string;
	readonly sourceModule: string;
	readonly sourcePackage: string;
	readonly sourceExport: string;
	readonly sourceVersion: string;
	readonly adapterPackage: string;
	readonly adapterVersion: string;
	readonly specifier: string;
}

/** Defines the resolved react compat adapters interface contract. */
export interface ResolvedReactCompatAdapters {
	readonly replacements: ReadonlyMap<string, ResolvedReactCompatReplacement>;
	readonly unsupportedSources: readonly UnsupportedReactCompatSource[];
	readonly sourcePolicies: readonly ResolvedReactCompatSourcePolicy[];
	readonly adapters: readonly string[];
	readonly ignoredAdapters: readonly string[];
}

/** Defines the resolved react compat source policy interface contract. */
export interface ResolvedReactCompatSourcePolicy {
	readonly sourceInstance: string;
	readonly sourceLocation: string;
	readonly sourceModule: string;
	readonly sourcePackage: string;
	readonly installedVersion: string;
	readonly fallback: 'retain' | 'error';
	readonly adapterPackage: string;
	readonly adapterVersion: string;
}

/** Defines the unsupported react compat source interface contract. */
export interface UnsupportedReactCompatSource {
	readonly sourceInstance: string;
	readonly sourceLocation: string;
	readonly sourceModule: string;
	readonly sourcePackage: string;
	readonly installedVersion: string;
	readonly supportedRanges: readonly string[];
	readonly adapterPackage: string;
	readonly adapterVersion: string;
}
