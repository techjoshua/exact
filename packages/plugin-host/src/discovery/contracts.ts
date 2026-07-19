import {
	type ExactPackageParticipation,
	type ExactPluginConfigurationDeclaration,
	type ExactPluginDeclaration
} from '@exact/plugin-api';
import { type ExactPackageNode } from '../graph.js';

/** Defines the exact discovery policy interface contract. */
export interface ExactDiscoveryPolicy {
	readonly mode: 'root' | 'trusted' | 'all';
	readonly trustedPackages: readonly string[];
	readonly trustedPrefixes: readonly string[];
	readonly ignore: readonly string[];
}

/** Defines the exact plugin requirement interface contract. */
export interface ExactPluginRequirement {
	readonly plugin: string;
	readonly range: string;
	readonly required: boolean;
	readonly parentId: string;
	readonly path: readonly string[];
}

/** Defines the exact participating package interface contract. */
export interface ExactParticipatingPackage {
	readonly node: ExactPackageNode;
	readonly participation: ExactPackageParticipation;
	readonly activationPaths: readonly (readonly string[])[];
}

/** Defines the exact selected plugin interface contract. */
export interface ExactSelectedPlugin {
	readonly packageName: string;
	readonly version: string;
	readonly node: ExactPackageNode;
	readonly declaration: ExactPluginDeclaration;
	readonly requirements: readonly ExactPluginRequirement[];
}

/** Defines the exact configuration contributor interface contract. */
export interface ExactConfigurationContributor {
	readonly plugin: string;
	readonly node: ExactPackageNode;
	readonly declaration: ExactPluginConfigurationDeclaration;
}

/** Describes the result produced by exact plugin discovery. */
export interface ExactPluginDiscoveryResult {
	readonly policy: ExactDiscoveryPolicy;
	readonly root: ExactPackageNode;
	readonly participants: ReadonlyMap<string, ExactParticipatingPackage>;
	readonly participantEdges: ReadonlyMap<string, ReadonlySet<string>>;
	readonly plugins: ReadonlyMap<string, ExactSelectedPlugin>;
	readonly contributors: readonly ExactConfigurationContributor[];
	readonly warnings: readonly string[];
}
