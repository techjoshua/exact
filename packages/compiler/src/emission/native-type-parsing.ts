import { createVirtualFileSystem } from '@typescript/native/unstable/fs';
import { isTypeAliasDeclaration, type TypeNode } from '@typescript/native/unstable/ast';
import { cloneNode } from '@typescript/native/unstable/ast/factory';
import {
	API as NativeAPI,
	type Snapshot as NativeSnapshot
} from '@typescript/native/unstable/sync';
import path from 'node:path';

/**
 * Parses detached generated type nodes through a dedicated TS7 project.
 *
 * Type snippets cannot be parsed through an emission snapshot while a
 * transform is visiting it. This sibling session keeps that ownership explicit
 * and caches immutable cloned type nodes by source text.
 */
class NativeTypeParsingSession {
	private readonly directory = normalize(path.resolve('.exact-native-type-parsing'));
	private readonly configFile = `${this.directory}/tsconfig.json`;
	private readonly sourceFile = `${this.directory}/type.ts`;
	private readonly fileSystem = createVirtualFileSystem({
		[this.configFile]: JSON.stringify({
			compilerOptions: { noEmit: true, noLib: true, noResolve: true },
			files: ['type.ts']
		}),
		[this.sourceFile]: 'type __ExactType = unknown;'
	});
	private readonly native = new NativeAPI({ cwd: this.directory, fs: this.fileSystem });
	private readonly cache = new Map<string, TypeNode>();
	private snapshot?: NativeSnapshot;

	/** Parses and clones one type expression for use in a different snapshot. */
	parse(source: string): TypeNode {
		const cached = this.cache.get(source);
		if (cached) return cloneNode(cached);
		this.fileSystem.writeFile?.(this.sourceFile, `type __ExactType = ${source};`);
		this.advance();
		const project = this.snapshot?.getProject(this.configFile) ?? this.snapshot?.getProjects()[0];
		const file = project?.program.getSourceFile(this.sourceFile);
		const statement = file?.statements[0];
		if (!statement || !isTypeAliasDeclaration(statement))
			throw new Error(`TypeScript 7 could not parse generated type: ${source}`);
		const parsed = cloneNode(statement.type);
		this.cache.set(source, parsed);
		return cloneNode(parsed);
	}

	/** Releases the parser process and its current snapshot. */
	dispose(): void {
		this.snapshot?.dispose();
		this.native.close();
		this.cache.clear();
	}

	private advance(): void {
		if (!this.snapshot) {
			this.snapshot = this.native.updateSnapshot({
				openProjects: [this.configFile],
				openFiles: [this.sourceFile]
			});
			return;
		}
		this.native.clearSourceFileCache();
		const next = this.native.updateSnapshot({ fileChanges: { changed: [this.sourceFile] } });
		this.snapshot.dispose();
		this.snapshot = next;
	}
}

let sharedParser: NativeTypeParsingSession | undefined;

/** Parses a detached TypeScript type with the official TS7 parser. */
export function parseNativeTypeNode(source: string): TypeNode {
	sharedParser ??= new NativeTypeParsingSession();
	return sharedParser.parse(source);
}

/** Releases the process-wide generated-type parser. */
export function clearNativeTypeParsingSession(): void {
	sharedParser?.dispose();
	sharedParser = undefined;
}

function normalize(filename: string): string {
	return filename.replaceAll('\\', '/');
}
