import type {
	Diagnostic as NativeDiagnostic,
	Project as NativeProject,
	Snapshot as NativeSnapshot
} from '@typescript/native/unstable/sync';
import type ts from 'typescript';
import type { ExactProfileSink } from '@exactjs/instrumentation';
import type { ExpressionNode, ExpressionSymbol, ExpressionType } from '../model.js';
import type { BoundModule } from '../module.js';
import type { ExpressionProjectProfileEvent } from './contracts.js';
import { ExpressionProjectError } from './errors.js';
import { NativeProjectionCompatibility } from './native-compatibility.js';
import { projectExpressionModule } from './projection-session.js';
import { normalizeFile } from './syntax.js';

/** Inputs retained by one native-to-eXact projection generation. */
export type NativeModuleProjectionOptions = {
	snapshot: NativeSnapshot;
	filename: string;
	expectedSource?: string;
	nativeTsconfigPath: string;
	diagnosticMode: 'syntax' | 'full';
	profileDetail: 'summary' | 'detailed';
	profileEnabled: boolean;
	recordProfile: ExactProfileSink<ExpressionProjectProfileEvent>;
	recordSemanticDiagnostics(): void;
	nodeIdentityRoots: Map<string, ExpressionNode>;
	overlayVersions: Map<string, number>;
	typeHandles: WeakMap<ExpressionType, ts.Type>;
	symbolIdentities: Map<string, ExpressionSymbol>;
	identityKeysByFile: Map<string, Set<string>>;
	fileVersion(filename: string): string;
};

/** Native module projection and its active assignability compatibility handle. */
export type NativeModuleProjection = Readonly<{
	module: BoundModule;
	compatibility: NativeProjectionCompatibility;
}>;

/** Projects one native snapshot source into backend-independent eXact values. */
export function projectNativeExpressionModule(
	options: NativeModuleProjectionOptions
): NativeModuleProjection {
	const project = nativeProjectFor(options);
	const nativeSource = nativeSourceFile(project, options.filename);
	if (!nativeSource)
		throw new ExpressionProjectError([
			{
				code: 'EXPR_FILE_MISSING',
				message:
					`Module is not part of the native expression project: ${options.filename}. ` +
					`Loaded roots: ${options.snapshot
						.getProjects()
						.flatMap((candidate) => candidate.rootFiles)
						.join(', ')}`,
				severity: 'error',
				filename: options.filename
			}
		]);
	if (options.expectedSource !== undefined && nativeSource.text !== options.expectedSource)
		throw new ExpressionProjectError([
			{
				code: 'EXPR_NATIVE_STALE_SOURCE',
				message:
					`TypeScript 7 returned a stale source generation for ${options.filename}: ` +
					`expected ${options.expectedSource.length} characters, received ${nativeSource.text.length}`,
				severity: 'error',
				filename: options.filename
			}
		]);
	const compatibility = new NativeProjectionCompatibility(project, nativeSource);
	const source = compatibility.sourceFile;
	const diagnostics = (values: readonly NativeDiagnostic[]) =>
		values.map((diagnostic) => projectDiagnostic(diagnostic, source));
	const program = {
		getSourceFile: (filename: string) =>
			normalizeFile(filename) === options.filename ? source : undefined,
		getSourceFiles: () => [source],
		getTypeChecker: () => compatibility.checker,
		getSyntacticDiagnostics: () =>
			diagnostics(project.program.getSyntacticDiagnostics(source.fileName)),
		getSemanticDiagnostics: () =>
			diagnostics(project.program.getSemanticDiagnostics(source.fileName))
	} as unknown as ts.Program;
	const module = projectExpressionModule({
		program,
		filename: options.filename,
		diagnosticMode: options.diagnosticMode,
		profileEnabled: options.profileEnabled,
		profileDetail: options.profileDetail,
		nodeTypeProjection: 'shallow',
		preferVariableTypes: true,
		recordProfile: options.recordProfile,
		recordSemanticDiagnostics: options.recordSemanticDiagnostics,
		nodeIdentityRoots: options.nodeIdentityRoots,
		overlayVersions: options.overlayVersions,
		typeHandles: options.typeHandles,
		symbolIdentities: options.symbolIdentities,
		identityKeysByFile: options.identityKeysByFile,
		fileVersion: options.fileVersion
	});
	return { module, compatibility };
}

function nativeProjectFor(options: NativeModuleProjectionOptions): NativeProject {
	const project =
		options.snapshot
			.getProjects()
			.find((candidate) => nativeSourceFile(candidate, options.filename) !== undefined) ??
		options.snapshot.getDefaultProjectForFile(options.filename) ??
		options.snapshot.getProject(options.nativeTsconfigPath);
	if (project) return project;
	throw new ExpressionProjectError([
		{
			code: 'EXPR_NATIVE_PROJECT_MISSING',
			message: `TypeScript 7 did not load a project for ${options.filename}`,
			severity: 'error',
			filename: options.filename,
			phase: 'configuration'
		}
	]);
}

function nativeSourceFile(project: NativeProject, filename: string) {
	const direct = project.program.getSourceFile(filename);
	if (direct) return direct;
	const matchingName = [...project.program.getSourceFileNames(), ...project.rootFiles].find(
		(candidate) => normalizeFile(candidate) === filename
	);
	return matchingName ? project.program.getSourceFile(matchingName) : undefined;
}

function projectDiagnostic(diagnostic: NativeDiagnostic, source: ts.SourceFile): ts.Diagnostic {
	return {
		category: diagnostic.category as unknown as ts.DiagnosticCategory,
		code: diagnostic.code,
		file:
			diagnostic.fileName && normalizeFile(diagnostic.fileName) === normalizeFile(source.fileName)
				? source
				: undefined,
		start: diagnostic.pos,
		length: Math.max(0, diagnostic.end - diagnostic.pos),
		messageText: diagnostic.text
	};
}
