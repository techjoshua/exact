import { createVirtualFileSystem } from '@typescript/native/unstable/fs';
import { type SourceFile, visitEachChild, type Visitor } from '@typescript/native/unstable/ast';
import { getSynthesizedDeepClone } from '@typescript/native/unstable/ast/clone';
import {
	API as NativeAPI,
	type Project as NativeProject,
	type Snapshot as NativeSnapshot
} from '@typescript/native/unstable/sync';
import path from 'node:path';

/**
 * Owns the TypeScript 7 process used for native post-transform printing.
 *
 * The unstable API currently requires parsed nodes to belong to a project
 * snapshot. A single virtual file is therefore updated between snapshots
 * instead of starting one Go process for every compiled module.
 */
class NativePrintingSession {
	private readonly directory = normalize(path.resolve('.exact-native-printing'));
	private readonly configFile = `${this.directory}/tsconfig.json`;
	private readonly sourceFile = `${this.directory}/output.tsx`;
	private readonly fileSystem = createVirtualFileSystem({
		[this.configFile]: JSON.stringify({
			compilerOptions: {
				jsx: 'preserve',
				module: 'esnext',
				noEmit: true,
				noLib: true,
				noResolve: true,
				target: 'esnext'
			},
			files: ['output.tsx']
		}),
		[this.sourceFile]: ''
	});
	private readonly native = new NativeAPI({
		cwd: this.directory,
		fs: this.fileSystem
	});
	private snapshot?: NativeSnapshot;
	private disposed = false;

	/** Parses, visits, and prints one generated program with TypeScript 7. */
	print(source: string, transform: NativeSourceTransformer = identityTransform): string {
		if (this.disposed) throw new Error('The native printing session has been disposed');
		this.fileSystem.writeFile?.(this.sourceFile, maskExactJSDoc(source));
		const snapshot = this.advanceSnapshot();
		const project = requiredProject(snapshot, this.configFile);
		const sourceFile = project.program.getSourceFile(this.sourceFile);
		if (!sourceFile) throw new Error('TypeScript 7 did not parse the native printing input');
		const transformed = transform(sourceFile);
		const emissionTree = getSynthesizedDeepClone(transformed, false);
		clearNodeRanges(emissionTree);
		const generated = project.emitter.printNode(emissionTree, { preserveSourceNewlines: false });
		this.fileSystem.writeFile?.(this.sourceFile, generated);
		const formattedSnapshot = this.advanceSnapshot();
		const formattedProject = requiredProject(formattedSnapshot, this.configFile);
		const formattedSource = formattedProject.program.getSourceFile(this.sourceFile);
		if (!formattedSource) throw new Error('TypeScript 7 did not parse its generated output');
		const printable = getSynthesizedDeepClone(formattedSource, false);
		clearNodeRanges(printable);
		const normalized = formattedProject.emitter.printNode(printable, {
			preserveSourceNewlines: false
		});
		this.fileSystem.writeFile?.(this.sourceFile, normalized);
		const normalizedSnapshot = this.advanceSnapshot();
		const normalizedProject = requiredProject(normalizedSnapshot, this.configFile);
		const normalizedSource = normalizedProject.program.getSourceFile(this.sourceFile);
		if (!normalizedSource) throw new Error('TypeScript 7 did not parse its normalized output');
		return terminateLine(removeTrailingCommas(normalized, normalizedSource));
	}

	/** Releases the native compiler process and its current immutable snapshot. */
	dispose(): void {
		if (this.disposed) return;
		this.snapshot?.dispose();
		this.native.close();
		this.disposed = true;
	}

	private advanceSnapshot(): NativeSnapshot {
		const previous = this.snapshot;
		if (!previous) {
			this.snapshot = this.native.updateSnapshot({
				openProjects: [this.configFile],
				openFiles: [this.sourceFile]
			});
			return this.snapshot;
		}
		this.native.clearSourceFileCache();
		const next = this.native.updateSnapshot({ fileChanges: { changed: [this.sourceFile] } });
		previous.dispose();
		this.snapshot = next;
		return next;
	}
}

/** Removes printer-added trailing commas without inspecting string or regular-expression text. */
function removeTrailingCommas(source: string, sourceFile: SourceFile): string {
	const offsets = new Set<number>();
	const visit = (node: import('@typescript/native/unstable/ast').Node): void => {
		node.forEachChild(visit, (nodes) => {
			if (nodes.length) {
				const last = nodes[nodes.length - 1]!;
				const comma = skipTrivia(source, last.end, node.end);
				if (source[comma] === ',') {
					const close = skipTrivia(source, comma + 1, node.end);
					if (source[close] === ')' || source[close] === ']' || source[close] === '}')
						offsets.add(comma);
				}
			}
			for (const child of nodes) visit(child);
		});
	};
	visit(sourceFile);
	if (!offsets.size) return source;
	let result = source;
	for (const offset of [...offsets].sort((left, right) => right - left))
		result = `${result.slice(0, offset)}${result.slice(offset + 1)}`;
	result = result.replace(/\/\*\*[\s\S]*?@exact[\s\S]*?\*\//g, '');
	result = result.replace(
		/__exactAny\(("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\)/g,
		'$1 as any'
	);
	return result.replace(
		/(=\s*)(\(\(\) => Object\.assign\(__exactImplementation_)/g,
		'$1/* @__PURE__ */ $2'
	);
}

function skipTrivia(source: string, start: number, end: number): number {
	let offset = start;
	while (offset < end) {
		if (/\s/.test(source[offset]!)) {
			offset++;
			continue;
		}
		if (source.startsWith('//', offset)) {
			const line = source.indexOf('\n', offset + 2);
			offset = line < 0 || line >= end ? end : line + 1;
			continue;
		}
		if (source.startsWith('/*', offset)) {
			const close = source.indexOf('*/', offset + 2);
			offset = close < 0 || close >= end ? end : close + 2;
			continue;
		}
		break;
	}
	return offset;
}

/** Clears parsed child positions on a fully materialized synthetic tree. */
function clearNodeRanges(node: import('@typescript/native/unstable/ast').Node): void {
	const mutable = node as unknown as { pos: number; end: number };
	mutable.pos = -1;
	mutable.end = -1;
	try {
		(node as unknown as { jsDoc?: unknown }).jsDoc = undefined;
	} catch {
		// Remote nodes are replaced by the synthesized clone before this walk.
	}
	node.forEachChild(clearNodeRanges, (nodes) => {
		try {
			(nodes as { hasTrailingComma?: boolean }).hasTrailingComma = false;
		} catch {
			// Some unchanged arrays remain remote snapshot views.
		}
		for (const child of nodes) clearNodeRanges(child);
	});
}

/** A native AST-to-AST source transformation. */
export type NativeSourceTransformer = (sourceFile: SourceFile) => SourceFile;

let sharedSession: NativePrintingSession | undefined;
const printedSources = new Map<string, string>();
const maximumCachedSources = 256;

/** Runs generated source through the TypeScript 7 visitor and Go printer. */
export function printNativeSource(source: string, transform?: NativeSourceTransformer): string {
	if (!transform) {
		const cached = printedSources.get(source);
		if (cached !== undefined) {
			printedSources.delete(source);
			printedSources.set(source, cached);
			return cached;
		}
	}
	sharedSession ??= new NativePrintingSession();
	const printed = sharedSession.print(source, transform);
	if (!transform) {
		printedSources.set(source, printed);
		if (printedSources.size > maximumCachedSources)
			printedSources.delete(printedSources.keys().next().value!);
	}
	return printed;
}

/** Releases the process-wide native printing convenience session. */
export function clearNativePrintingSession(): void {
	sharedSession?.dispose();
	sharedSession = undefined;
	printedSources.clear();
}

function identityTransform(sourceFile: SourceFile): SourceFile {
	const visitor: Visitor = (node) => visitEachChild(node, visitor);
	return visitEachChild(sourceFile, visitor);
}

function requiredProject(snapshot: NativeSnapshot, configFile: string): NativeProject {
	const project = snapshot.getProject(configFile) ?? snapshot.getProjects()[0];
	if (!project) throw new Error('TypeScript 7 did not create the native printing project');
	return project;
}

function terminateLine(source: string): string {
	return source.endsWith('\n') ? source : `${source}\n`;
}

function normalize(filename: string): string {
	return filename.replaceAll('\\', '/');
}

function maskExactJSDoc(source: string): string {
	return source.replace(/\/\*\*[\s\S]*?@exact[\s\S]*?\*\//g, (comment) =>
		comment.replace(/[^\r\n]/g, ' ')
	);
}
