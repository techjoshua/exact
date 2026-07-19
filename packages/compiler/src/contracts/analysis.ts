import type { ExactArtifactTarget } from './artifacts.js';
import type { ExactPlacement } from './policy.js';

export type ExactEnvironmentEffect = 'neutral' | 'browser' | 'server' | 'mixed' | 'unknown';

export type ExactEnvironmentEffectSourceIR = {
	environment: 'browser' | 'server' | 'unknown';
	description: string;
	path: string[];
};

export type ExactCallEdgeIR = {
	id: string;
	name: string;
	targetId?: string;
	moduleSpecifier?: string;
	exportName?: string;
	resolved: boolean;
	receiverBindings?: Array<{
		parameterIndex: number;
		source: 'component' | 'parameter' | 'unknown';
		sourceParameterIndex?: number;
	}>;
};

export type ExactCallableSummaryIR = {
	id: string;
	name: string;
	kind: 'function' | 'method' | 'component' | 'task' | 'initializer' | 'module-initializer';
	exportNames: string[];
	directEffect: ExactEnvironmentEffect;
	effect: ExactEnvironmentEffect;
	directEffectSources: ExactEnvironmentEffectSourceIR[];
	effectSources: ExactEnvironmentEffectSourceIR[];
	calls: ExactCallEdgeIR[];
	artifactTargets: ExactArtifactTarget[];
	stateReads: ExactStateEffect[];
	stateWrites: ExactStateEffect[];
	contexts: ExactContextEffect[];
};

export type ExactStateEffect = {
	path: string;
	kind: 'read' | 'write';
	confidence: 'exact' | 'broad' | 'unknown';
	receiver?: { kind: 'component' } | { kind: 'parameter'; index: number } | { kind: 'unknown' };
};

export type ExactContextEffect = {
	token: string;
	kind: 'read' | 'write';
	confidence: 'exact' | 'unknown';
};

export type ExactTaskIR = {
	id: string;
	placement: ExactPlacement;
	requestedPlacement?: 'server' | 'client';
	async: boolean;
	browserEffects: boolean;
	reads: ExactStateEffect[];
	writes: ExactStateEffect[];
	contexts: ExactContextEffect[];
	diagnostics: string[];
	environmentEffect?: ExactEnvironmentEffect;
	effectSources?: ExactEnvironmentEffectSourceIR[];
};

export type ExactComponentRenderEdgeIR = {
	id: string;
	tag: string;
	name: string;
	componentId?: string;
	placement: ExactPlacement;
	boundary: ExactPlacement;
	index: number;
	path: string;
};

export type ExactComponentIR = {
	id: string;
	name: string;
	exported: boolean;
	placement: ExactPlacement;
	subgraphPlacement: ExactPlacement;
	renderEdges: ExactComponentRenderEdgeIR[];
	clientIslandCount: number;
	tasks: ExactTaskIR[];
	contexts: ExactContextEffect[];
	splitBoundaries: string[];
	diagnostics: string[];
	environmentEffect?: ExactEnvironmentEffect;
	artifactTargets?: ExactArtifactTarget[];
};

export type ExactExportIR = {
	name: string;
	kind: 'component' | 'value';
	placement: ExactPlacement;
};

export type ExactArtifactExportIR = ExactExportIR & {
	artifactClass: 'shared' | 'dual' | 'client' | 'server';
};

export type ExactSymbolIR = {
	id: string;
	componentId?: string;
	exportName?: string;
	localName: string;
	generatedName: string;
	debugName: string;
	kind: 'component' | 'value';
	role: 'root' | 'server-part' | 'client-island';
	target: 'client' | 'server' | 'both';
	placement: ExactPlacement;
};

export type ExactBoundaryIR = {
	id: string;
	name: string;
	componentId?: string;
	ownerComponentId?: string;
	renderEdgeId?: string;
	renderEdgeIndex?: number;
	renderPath?: string;
	kind: 'client-island' | 'server-slot';
};

export type ExactImportedComponentIR = {
	name: string;
	boundaryName?: string;
	placement: ExactPlacement;
	componentId?: string;
};

export type ExactSemanticScopeIR = {
	id: string;
	parentId?: string;
	kind: 'module' | 'function' | 'block';
	nodeKind: string;
};

export type ExactSemanticDeclarationIR = {
	id: string;
	name: string;
	scopeId: string;
	kind: 'import' | 'function' | 'class' | 'variable' | 'parameter' | 'type' | 'interface';
	nodeStart: number;
	nodeEnd: number;
	moduleSpecifier?: string;
	importedName?: string;
	typeOnly?: boolean;
	exportedName?: string;
};

export type ExactSemanticReferenceIR = {
	name: string;
	scopeId: string;
	source: 'local' | 'import' | 'global' | 'unresolved';
	nodeStart: number;
	nodeEnd: number;
	declarationId?: string;
	declarationKind?: ExactSemanticDeclarationIR['kind'];
	moduleSpecifier?: string;
	importedName?: string;
	typeOnly?: boolean;
	exportedName?: string;
};

export type ExactSemanticExportIR = {
	exportedName: string;
	localName?: string;
	importedName?: string;
	moduleSpecifier?: string;
	typeOnly?: boolean;
};

export type ExactSemanticGraphIR = {
	scopes: ExactSemanticScopeIR[];
	declarations: ExactSemanticDeclarationIR[];
	references: ExactSemanticReferenceIR[];
	exports: ExactSemanticExportIR[];
};
