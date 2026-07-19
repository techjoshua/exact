export interface ModuleExportReplacement {
	readonly sourceModule: string;
	readonly sourceExport: string;
	readonly targetModule: string;
	readonly targetExport: string;
}

export interface ModuleRewriteOptions {
	readonly filename?: string;
	readonly moduleAliases?: Readonly<Record<string, string>>;
	readonly replacements?: readonly ModuleExportReplacement[];
	readonly sourceMap?: boolean;
}

export interface ModuleRewriteResult {
	readonly code: string;
	readonly map: unknown;
	readonly filename: string;
	readonly changed: boolean;
}
