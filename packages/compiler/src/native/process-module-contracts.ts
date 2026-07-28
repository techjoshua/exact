/** Module identities and public exports rewritten before native printing. */
export type NativeCompilerModuleRewrite = Readonly<{
	moduleAliases: Readonly<Record<string, string>>;
	replacements: readonly NativeCompilerModuleExportReplacement[];
}>;

/** One public module export redirected by the native artifact printer. */
export type NativeCompilerModuleExportReplacement = Readonly<{
	sourceModule: string;
	sourceExport: string;
	targetModule: string;
	targetExport: string;
}>;
