import type { PreparedComponentOutput } from './prepared-component-attachment.js';
import type { ExactRenderProgramInvocation } from '@exactjs/core/runtime/render-operations';
import {
	readClientComponentInput,
	type AdmittedClientComponentInput
} from './component-input-admission.js';
import {
	attachSuppressedCleanupFailure,
	type AnyComponentInstance,
	type Child
} from '@exactjs/core';
import {
	projectPreparedText,
	type PreparedTextResolver
} from '@exactjs/core/framework/render-structure';
import {
	exactCompiledClientAttachment,
	exactCompiledDirectProgramAttachment,
	exactCompatibilityClientAttachment
} from '@exactjs/core/runtime/component-operations';
import { peek } from '@exactjs/reactive/framework/runtime';
import type { Mounted, Root } from '../types.js';
import { prepareComponentReceipt } from './prepare-component-receipt.js';
import { receiveComponentReceipt } from './mounting/native-component-artifact.js';
import { refreshComponentRoot, rootIntroduction } from './component-roots.js';
import { domEnhancementCapability, type TextComponentVisitor } from './enhancement-capability.js';
import { createTextProgramProjection } from './text-program-projection.js';
import { unmountMounted } from './teardown.js';

type Frame = {
	owner?: AnyComponentInstance;
	mounted: Mounted;
	cursor: number;
	records: RecordOwner[];
};
type RecordOwner = Frame & {
	receipt: AdmittedClientComponentInput;
	output: PreparedComponentOutput;
};

/**
 * Retains native component lifetimes inside one coalesced Text presentation. Preparation captures
 * output once; serialization never mounts callback-bearing Elements. Each nested owner receives
 * its actual context parent, shares the physical Text presentation, and keeps separate cleanup.
 */
export class TextComponentProjection {
	private readonly frame: Frame;
	private current: Frame;
	private enhancementProjection?: PreparedTextResolver;
	private readonly programProjection: ReturnType<typeof createTextProgramProjection>;
	constructor(
		private readonly root: Root,
		mounted: Mounted,
		private readonly text: Text,
		parent?: AnyComponentInstance
	) {
		this.programProjection = createTextProgramProjection(text.ownerDocument);
		this.frame = this.current = {
			mounted,
			owner: mounted.instance ?? parent,
			cursor: 0,
			records: []
		};
	}

	/** Reads only reactive output and receives changed inputs into retained native owners. */
	read(children: readonly Child[] | ExactRenderProgramInvocation): string {
		this.current = this.frame;
		this.frame.cursor = 0;
		try {
			if (Array.isArray(children)) return projectPreparedText(children, this.root, this.resolve);
			const direct = children as ExactRenderProgramInvocation;
			const supplied = this.directResolver(direct);
			return projectPreparedText(
				[direct],
				this.root,
				(value, project) => supplied(value, project) ?? this.resolve(value, project)
			);
		} finally {
			this.finish(this.frame);
		}
	}

	/** Carries only the actual output handed to this presentation by its compiled attachment. */
	private directResolver(invocation: ExactRenderProgramInvocation): PreparedTextResolver {
		return (value, project) =>
			value === invocation
				? (this.enhancementProjection?.(value, project) ??
					this.programProjection.direct(invocation, project))
				: undefined;
	}

	private readonly resolve: PreparedTextResolver = (value, project) => {
		this.enhancementProjection ??= domEnhancementCapability()?.createTextProjection?.(
			this.root,
			this.component
		);
		const enhanced = this.enhancementProjection?.(value, project);
		if (enhanced !== undefined) return enhanced;

		const program = this.programProjection.resolve(value, project);
		if (program !== undefined) return program;
		const receipt = readClientComponentInput(value);
		return receipt
			? this.component(receipt, (output, _mounted, supplied) =>
					project(Array.isArray(output) ? output : [output], supplied)
				)
			: undefined;
	};

	private readonly component: TextComponentVisitor = (receipt, visit) => {
		const parent = this.current;
		const index = parent.cursor++;
		const matches = (entry: RecordOwner) =>
			entry.receipt.contract.artifact === receipt.contract.artifact &&
			entry.receipt.key === receipt.key &&
			entry.receipt.domain === receipt.domain;
		let record: RecordOwner | undefined = parent.records[index];
		if (record && !matches(record)) {
			const retained =
				receipt.key === undefined
					? -1
					: parent.records.findIndex((entry, position) => position > index && matches(entry));
			if (retained >= 0) {
				[record] = parent.records.splice(retained, 1);
				parent.records.splice(index, 0, record!);
			} else record = undefined;
		}
		if (!record) {
			record = peek(() => this.prepare(receipt, parent));
			parent.records.splice(index, 0, record);
			parent.mounted.children = parent.records.map((entry) => entry.mounted);
		} else if (record.receipt !== receipt) {
			const retained = record;
			peek(() => receiveComponentReceipt(retained.mounted, receipt));
			record.receipt = receipt;
		}
		record.cursor = 0;
		this.current = record;
		try {
			const output = Array.isArray(record.output)
				? (domEnhancementCapability()?.projectComponent?.(record.mounted, [...record.output]) ??
					record.output)
				: record.output;
			return Array.isArray(output)
				? visit(output, record.mounted)
				: visit(output, record.mounted, this.directResolver(output));
		} finally {
			this.finish(record);
			this.current = parent;
		}
	};

	private prepare(receipt: AdmittedClientComponentInput, parent: Frame): RecordOwner {
		const attachment = prepareComponentReceipt(
			this.root,
			receipt,
			parent.owner,
			parent.mounted.scope,
			this.text.parentNode ?? undefined,
			!this.root.initialCommitComplete &&
				(this.root.mode === 'hydrated' || this.root.mode === 'document')
				? 'hydrate'
				: 'mount'
		);
		try {
			const mounted = attachment.ownedRange;
			const output = attachment.output;
			const record: RecordOwner = {
				mounted,
				owner: mounted.instance,
				receipt,
				output,
				cursor: 0,
				records: []
			};
			const present = (_artifact: unknown, instance: object, output: PreparedComponentOutput) => {
				record.output = output;
				mounted.dom = this.text;
				mounted.end = undefined;
				mounted.textPresentation = this.text;
				refreshComponentRoot(
					this.root,
					instance as AnyComponentInstance,
					true,
					rootIntroduction(this.root)
				);
				mounted.afterPlacement = () => (instance as AnyComponentInstance).markMounted();
				mounted.afterPlacementPhase = 'mount';
				return mounted;
			};
			attachment.commit({
				[exactCompiledDirectProgramAttachment]: present,
				[exactCompiledClientAttachment]: present,
				[exactCompatibilityClientAttachment]: () => {
					throw new TypeError('Text projection requires native component output');
				}
			});
			return record;
		} catch (error) {
			try {
				attachment.abort();
			} catch (cleanup) {
				attachSuppressedCleanupFailure(error, cleanup);
			}
			throw error;
		}
	}

	private finish(frame: Frame): void {
		for (const discarded of frame.records.splice(frame.cursor)) unmountMounted(discarded.mounted);
		frame.mounted.children = frame.records.map((record) => record.mounted);
	}
}
