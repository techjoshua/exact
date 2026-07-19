import type { ExactContextEffect, ExactEnvironmentEffect } from '../types.js';

/** Defines the expression render site interface contract. */
export interface ExpressionRenderSite {
	readonly nodeId: string;
	readonly tag: string;
	readonly start: number;
	readonly end: number;
	readonly path: string;
	readonly serverSlotChildren: boolean;
}

/** Defines the expression client island site interface contract. */
export interface ExpressionClientIslandSite {
	readonly nodeId: string;
	readonly index: number;
	readonly start: number;
	readonly end: number;
	readonly serverOnlyChildren: boolean;
	readonly childTags: readonly string[];
	readonly valueCaptures: readonly string[];
	readonly functionCaptures: readonly string[];
	readonly stateReads: readonly string[];
}

/** Defines the expression component site interface contract. */
export interface ExpressionComponentSite {
	readonly id: string;
	readonly name: string;
	readonly start: number;
	readonly end: number;
	readonly clientEffects: boolean;
	readonly serverEffects: boolean;
	readonly environmentEffect: ExactEnvironmentEffect;
	readonly clientIslandCount: number;
	readonly splitBoundaries: readonly string[];
	readonly diagnostics: readonly string[];
	readonly browserGlobalsOutsideClientBoundary: readonly string[];
	readonly contexts: readonly ExactContextEffect[];
	readonly contextSites: readonly Readonly<{ start: number; effect: ExactContextEffect }>[];
	readonly renders: readonly ExpressionRenderSite[];
	readonly clientIslands: readonly ExpressionClientIslandSite[];
}

/** Describes the planned expression component operation. */
export interface ExpressionComponentPlan {
	readonly sites: ReadonlyMap<string, ExpressionComponentSite>;
	/** Source-ordered declaration identities used by syntax emission without span-based semantic joins. */
	readonly declarations: readonly ExpressionFunctionDeclaration[];
}

/** Defines the expression function declaration interface contract. */
export interface ExpressionFunctionDeclaration {
	readonly id: string;
	readonly name?: string;
	readonly componentId?: string;
}
