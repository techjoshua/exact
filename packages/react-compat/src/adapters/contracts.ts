import {
	type PackageManifestLike,
	type ReactCompatReplacementDeclaration
} from '@exact/react-compat-adapter-api';

export interface ReactCompatPackageNode {
	readonly id: string;
	readonly location: string;
	readonly manifest: PackageManifestLike;
	readonly dependencies: readonly string[];
}

export interface ReactCompatPackageGraph {
	readonly rootId: string;
	readonly nodes: ReadonlyMap<string, ReactCompatPackageNode>;
}

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

export interface ResolvedReactCompatAdapters {
	readonly replacements: ReadonlyMap<string, ResolvedReactCompatReplacement>;
	readonly unsupportedSources: readonly UnsupportedReactCompatSource[];
	readonly sourcePolicies: readonly ResolvedReactCompatSourcePolicy[];
	readonly adapters: readonly string[];
	readonly ignoredAdapters: readonly string[];
}

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
