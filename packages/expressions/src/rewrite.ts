import { printNode } from './builder.js';
import type { ExpressionNode, Variable } from './model.js';
import {
	createModule,
	type BoundModule,
	type ExpressionModule,
	type UnboundModule
} from './module.js';
import type { NodeRef } from './query.js';
import { validateExpressionTree } from './validation.js';

type Replacement = ExpressionNode | null;
type RewriteSelector = (ref: NodeRef) => boolean;
type RewriteFactory = (ref: NodeRef) => Replacement;
let generatedRewriteId = 1;
let generatedCloneId = 1;

/** Carries the context required by text lowering. */
export interface TextLoweringContext {
	readonly reference: NodeRef;
	readonly text: string;
	readonly childText: readonly string[];
}

/** Defines the text lowerer type contract. */
export type TextLowerer = (context: TextLoweringContext) => string | undefined;

/** Collects immutable tree edits and applies them in one structural-sharing pass. */
export class ModuleRewriter {
	private readonly replacements: Array<
		Readonly<{ select: RewriteSelector; replace: RewriteFactory }>
	> = [];
	private readonly before = new Map<ExpressionNode, ExpressionNode[]>();
	private readonly after = new Map<ExpressionNode, ExpressionNode[]>();

	/** Performs the replace where domain operation for this module rewriter instance. */
	replaceWhere(select: RewriteSelector, replace: RewriteFactory): this {
		this.replacements.push(Object.freeze({ select, replace }));
		return this;
	}

	/** Replaces a region with generated TypeScript that is rebound before checked emission. */
	replaceTextWhere(select: RewriteSelector, replace: (ref: NodeRef) => string): this {
		return this.replaceWhere(select, (ref) => generatedNode(ref, replace(ref)));
	}

	/** Releases where and its owned resources for this module rewriter instance. */
	removeWhere(select: RewriteSelector): this {
		return this.replaceWhere(select, () => null);
	}

	/** Performs the insert before domain operation for this module rewriter instance. */
	insertBefore(target: ExpressionNode | NodeRef, node: ExpressionNode): this {
		const key = 'node' in target ? target.node : target;
		this.before.set(key, [...(this.before.get(key) ?? []), node]);
		return this;
	}

	/** Performs the insert after domain operation for this module rewriter instance. */
	insertAfter(target: ExpressionNode | NodeRef, node: ExpressionNode): this {
		const key = 'node' in target ? target.node : target;
		this.after.set(key, [...(this.after.get(key) ?? []), node]);
		return this;
	}

	/** Performs the insert text before domain operation for this module rewriter instance. */
	insertTextBefore(target: ExpressionNode | NodeRef, text: string): this {
		const ref = 'node' in target ? target : undefined;
		const node = ref
			? generatedNode(ref, text)
			: generatedNodeFromNode(target as ExpressionNode, text);
		return this.insertBefore(target, node);
	}

	/** Performs the insert text after domain operation for this module rewriter instance. */
	insertTextAfter(target: ExpressionNode | NodeRef, text: string): this {
		const ref = 'node' in target ? target : undefined;
		const node = ref
			? generatedNode(ref, text)
			: generatedNodeFromNode(target as ExpressionNode, text);
		return this.insertAfter(target, node);
	}

	/** Applies an apply to the owned runtime state for this module rewriter instance. */
	apply(module: BoundModule | UnboundModule): BoundModule | UnboundModule {
		if (module.state === 'unbound' && module.provenance) {
			throw new Error(
				'Rebind an unbound rewritten module before applying another span-based rewrite'
			);
		}
		const edits: Array<{ start: number; end: number; text: string }> = [];
		const newline = module.trivia.newline === 'crlf' ? '\r\n' : '\n';
		const selected = [...module.walk()]
			.flatMap((ref) =>
				this.replacements
					.filter((operation) => operation.select(ref))
					.map(() => ref.node.span)
					.filter((span): span is NonNullable<typeof span> => !!span)
			)
			.sort((left, right) => left.start - right.start || right.end - left.end);
		for (let index = 1; index < selected.length; index++) {
			const prior = selected[index - 1]!;
			const current = selected[index]!;
			if (current.start < prior.end) {
				throw new Error(
					`Overlapping expression rewrites at ${current.start}:${current.end}; compose nested rewrites with lowerModuleText()`
				);
			}
		}
		const rewrite = (node: ExpressionNode): ExpressionNode | null => {
			const ref = module.ref(node);
			for (const operation of this.replacements) {
				if (!operation.select(ref)) continue;
				const replacement = operation.replace(ref);
				if (node.span)
					edits.push({
						start: node.span.start,
						end: node.span.end,
						text: replacement ? hostText(printNode(replacement), newline) : ''
					});
				return replacement;
			}
			let changed = false;
			const children: ExpressionNode[] = [];
			for (const child of node.children) {
				const prefix = this.before.get(child);
				if (prefix) {
					children.push(...prefix);
					changed = true;
					if (child.span)
						edits.push({
							start: child.span.start,
							end: child.span.start,
							text: `${prefix.map((node) => hostText(printNode(node), newline)).join(newline)}${newline}`
						});
				}
				const next = rewrite(child);
				if (next) children.push(next);
				if (next !== child) changed = true;
				const suffix = this.after.get(child);
				if (suffix) {
					children.push(...suffix);
					changed = true;
					if (child.span)
						edits.push({
							start: child.span.end,
							end: child.span.end,
							text: `${newline}${suffix.map((node) => hostText(printNode(node), newline)).join(newline)}`
						});
				}
			}
			if (!changed) return node;
			return Object.freeze({
				...node,
				children: Object.freeze(children),
				synthetic: node.synthetic || !node.span
			});
		};
		const root = rewrite(module.rootNode);
		if (!root) throw new Error('An expression module root cannot be removed');
		if (root === module.rootNode && edits.length === 0) return module;
		const applied = applyEdits(module.source, edits);
		const priorOrigins = module.provenance?.lineOrigins;
		const lineOrigins = Object.freeze(
			applied.lineOrigins.map((line) => priorOrigins?.[line] ?? line)
		);
		return createModule({
			filename: module.filename,
			source: applied.source,
			root,
			state: 'unbound',
			trivia: module.trivia,
			diagnostics: validateExpressionTree(root, module.filename),
			provenance: Object.freeze({
				originalSource: module.provenance?.originalSource ?? module.source,
				lineOrigins
			})
		});
	}
}

function generatedNode(reference: NodeRef, text: string): ExpressionNode {
	return generatedNodeFromNode(reference.node, text);
}

function generatedNodeFromNode(anchor: ExpressionNode, text: string): ExpressionNode {
	return Object.freeze({
		id: `generated-rewrite:${generatedRewriteId++}`,
		kind: anchor.kind,
		category: anchor.category,
		scope: anchor.scope,
		synthetic: true,
		children: Object.freeze([]),
		generatedText: text
	});
}

function hostText(value: string, newline: string): string {
	return value.replace(/\r?\n/g, newline);
}

function applyEdits(
	source: string,
	edits: readonly { start: number; end: number; text: string }[]
): Readonly<{ source: string; lineOrigins: readonly number[] }> {
	const ordered = [...edits].sort(
		(left, right) => right.start - left.start || right.end - left.end
	);
	let boundary = source.length + 1;
	const accepted: typeof ordered = [];
	for (const edit of ordered) {
		if (edit.end > boundary) {
			throw new Error(
				`Overlapping expression rewrites at ${edit.start}:${edit.end}; compose nested rewrites with lowerModuleText()`
			);
		}
		accepted.push(edit);
		boundary = edit.start;
	}
	accepted.reverse();
	let output = '';
	let cursor = 0;
	let lineStart = true;
	const lineOrigins: number[] = [];
	const lineAt = (offset: number): number => source.slice(0, offset).split(/\r?\n/).length - 1;
	const append = (text: string, origin: number, advance: boolean): void => {
		let line = origin;
		for (let index = 0; index < text.length; index++) {
			if (lineStart) {
				lineOrigins.push(line);
				lineStart = false;
			}
			const character = text[index]!;
			output += character;
			if (character === '\n') {
				lineStart = true;
				if (advance) line++;
			}
		}
	};
	for (const edit of accepted) {
		append(source.slice(cursor, edit.start), lineAt(cursor), true);
		append(edit.text, lineAt(edit.start), false);
		cursor = edit.end;
	}
	append(source.slice(cursor), lineAt(cursor), true);
	if (lineStart) lineOrigins.push(lineAt(cursor));
	return Object.freeze({ source: output, lineOrigins: Object.freeze(lineOrigins) });
}

/** Transforms module into its required representation. */
export function rewriteModule(
	module: BoundModule | UnboundModule,
	configure: (rewriter: ModuleRewriter) => void
): BoundModule | UnboundModule {
	const rewriter = new ModuleRewriter();
	configure(rewriter);
	return rewriter.apply(module);
}

/**
 * Composes generated regions bottom-up against one immutable source version.
 * Parent lowerers see child replacements already applied, avoiding unstable
 * intermediate parse offsets.
 */
export function lowerModuleText(module: ExpressionModule, lower: TextLowerer): string {
	const rendered = new Map<ExpressionNode, string>();
	const render = (node: ExpressionNode): string => {
		const childText = node.children.map(render);
		let text = node.span
			? renderSourceRegion(module.source, node, childText)
			: (node.generatedText ?? node.text ?? childText.join(''));
		const replacement = lower(
			Object.freeze({ reference: module.ref(node), text, childText: Object.freeze(childText) })
		);
		if (replacement !== undefined) text = replacement;
		rendered.set(node, text);
		return text;
	};
	return render(module.rootNode);
}

function renderSourceRegion(
	source: string,
	node: ExpressionNode,
	childText: readonly string[]
): string {
	const span = node.span!;
	let cursor = span.start;
	let output = '';
	node.children.forEach((child, index) => {
		if (!child.span || child.span.start < span.start || child.span.end > span.end) return;
		output += source.slice(cursor, child.span.start);
		output += childText[index] ?? source.slice(child.span.start, child.span.end);
		cursor = child.span.end;
	});
	output += source.slice(cursor, span.end);
	return output;
}

/** Performs the clone with variables domain operation. */
export function cloneWithVariables(
	node: ExpressionNode,
	variables: ReadonlyMap<Variable, Variable>
): ExpressionNode {
	const required = new Set<Variable>();
	collectVariables(node, required);
	for (const variable of required) {
		if (!variables.has(variable))
			throw new Error(`cloneWithVariables requires an explicit mapping for ${variable.name}`);
	}
	const cloneId = generatedCloneId++;
	return cloneNodeWithVariables(node, variables, cloneId);
}

function cloneNodeWithVariables(
	node: ExpressionNode,
	variables: ReadonlyMap<Variable, Variable>,
	cloneId: number
): ExpressionNode {
	const children = node.children.map((child) => cloneNodeWithVariables(child, variables, cloneId));
	return Object.freeze({
		...node,
		id: `${node.id}:clone:${cloneId}`,
		children: Object.freeze(children),
		synthetic: true,
		span: undefined,
		variable: node.variable ? variables.get(node.variable)! : undefined
	});
}

function collectVariables(node: ExpressionNode, output: Set<Variable>): void {
	if (node.variable) output.add(node.variable);
	for (const child of node.children) collectVariables(child, output);
}
