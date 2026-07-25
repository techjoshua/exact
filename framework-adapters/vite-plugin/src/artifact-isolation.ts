import { assertExactClientArtifactIsolation } from '@exactjs/compiler';

/** Describes the Rollup output metadata needed by the isolation verifier. */
export type ExactRollupOutputLike = {
	type: 'chunk' | 'asset';
	fileName: string;
	facadeModuleId?: string | null;
	isEntry?: boolean;
	modules?: Readonly<Record<string, unknown>>;
	imports?: readonly string[];
	dynamicImports?: readonly string[];
};

/** Rejects server-only modules or imports in a final Vite client bundle. */
export function assertExactViteClientArtifactIsolation(
	bundle: Readonly<Record<string, ExactRollupOutputLike>>
): void {
	assertExactClientArtifactIsolation(
		Object.values(bundle).map((output) => ({
			fileName: output.fileName,
			type: output.type,
			modules: output.modules ? Object.keys(output.modules) : undefined,
			imports: output.imports,
			dynamicImports: output.dynamicImports
		}))
	);
}
