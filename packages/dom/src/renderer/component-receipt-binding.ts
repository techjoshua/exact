import { withSuppliedPlacementInputs } from './supplied-placement-capability.js';
import { watchRetained } from '@exactjs/reactive/framework/watch';
import { type AdmittedClientComponentInput } from './component-input-admission.js';
import {
	attemptCleanup,
	createCleanupFailure,
	throwCleanupFailure,
	attachSuppressedCleanupFailure
} from '@exactjs/core';
import { validateComponentReceiptSupplier } from '@exactjs/core/runtime/component-operations';
import type { ExactRenderProgramBindingTarget } from '@exactjs/core/runtime/render-operations';
import {
	createEffectScope,
	withEffectScope,
	computedSnapshot,
	peek,
	type EffectScope,
	type ReactiveValue
} from '@exactjs/reactive/framework/runtime';
import { clientComponentRecipe } from './component-input-admission.js';
import { componentReceiptInputs } from './component-receipt-inputs.js';
import type { Mounted } from '../types.js';
import type { CompiledProgramBindingTarget } from './component-update-storage.js';
import { bindCompiledComponentUpdate } from './component-update-binding.js';
import { bindCompiledWideComponentUpdate } from './component-update-wide-binding.js';
import {
	bindCompiledStateComponentUpdate,
	bindCompiledWideStateComponentUpdate
} from './component-state-update-binding.js';

/** One consumer-owned association. Subscription storage remains owned by the lexical supplier. */
type ReceiptAssociation = CompiledProgramBindingTarget & {
	receipt: AdmittedClientComponentInput;
	committed: boolean;
	pending: boolean;
	scope?: EffectScope;
	cell?: ReactiveValue<InputSnapshot>;
	accepted?: InputSnapshot;
};
/** Stable teardown holder installed once on one mounted consumer. */
export type ComponentReceiptBinding = {
	current?: ReceiptAssociation;
	currentAttempt?: object;
	currentHandoff?: object;
	pending?: PreparedInputAttempt;
	acceptedInputs?: ReturnType<typeof componentReceiptInputs>;
};
type InputSnapshot = { attempt: object; inputs: ReturnType<typeof componentReceiptInputs> };
/** One staged input read. Transfer is conditional on its consumer-local attempt identity. */
export type PreparedInputAttempt = {
	readonly inputs: ReturnType<typeof componentReceiptInputs>;
	isCurrent(): boolean;
	beginDelivery(): void;
	commit(): boolean;
	stop(): void;
};

/** Releases every target membership, including active publication snapshots, preserving cleanup failures. */
function stopAssociation(target: ReceiptAssociation | undefined): void {
	if (!target) return;
	target.valid = false;
	target.committed = false;
	const failure = createCleanupFailure();
	for (const handle of target.stopBindings.splice(0)) attemptCleanup(failure, () => handle.stop());
	if (target.scope) attemptCleanup(failure, () => target.scope!.stop());
	throwCleanupFailure(failure);
}

/**
 * Begins an attempt before authored reads. A reader cell and indexed memberships share the
 * existing association. Construction consumes the first read and arming consumes its cache.
 */
export function prepareComponentReceiptBinding(
	mounted: Mounted,
	incoming: AdmittedClientComponentInput,
	receivingCurrent: () => boolean = () => true
): PreparedInputAttempt {
	const receipt = clientComponentRecipe(incoming.admitted);
	let holder = mounted.componentReceiptBinding;
	if (!holder) {
		holder = {};
		mounted.componentReceiptBinding = holder;
		const binding = holder,
			oldStop = mounted.stop;
		mounted.stop = () => {
			const failure = createCleanupFailure();
			const current = binding.current;
			binding.current = undefined;
			binding.currentAttempt = {};
			attemptCleanup(failure, () => stopAssociation(current));
			attemptCleanup(failure, () => binding.pending?.stop());
			binding.pending = undefined;
			if (oldStop) attemptCleanup(failure, oldStop);
			throwCleanupFailure(failure);
		};
	}
	const binding = holder,
		attempt = {},
		handoff = {};
	const previousAttempt = binding.currentAttempt,
		previousHandoff = binding.currentHandoff;
	const previous = binding.current;
	let delivered = false;
	binding.currentAttempt = attempt;
	binding.currentHandoff = handoff;
	const restoreUndelivered = () => {
		if (
			!delivered &&
			binding.currentHandoff === handoff &&
			binding.currentAttempt === attempt &&
			binding.current === previous
		) {
			binding.currentAttempt = previousAttempt;
			binding.currentHandoff = previousHandoff;
		}
	};
	const update = receipt.update;
	try {
		if (update) validateComponentReceiptSupplier(update);
	} catch (error) {
		restoreUndelivered();
		throw error;
	}
	if (
		receipt.children.kind === 'eager' &&
		(!previous || previous.receipt.children.kind === 'eager') &&
		(previous?.receipt.update === update ||
			(previous?.receipt.update?.owner === update?.owner &&
				previous?.receipt.update?.contract === update?.contract &&
				previous?.receipt.update?.target === update?.target))
	) {
		let inputs: ReturnType<typeof componentReceiptInputs>;
		try {
			inputs = withEffectScope(mounted.scope, () => componentReceiptInputs(receipt));
		} catch (error) {
			restoreUndelivered();
			throw error;
		}
		let transferred = false;
		const isCurrent = () =>
			mounted.scope.active &&
			binding.currentHandoff === handoff &&
			(transferred || (receivingCurrent() && binding.currentAttempt === attempt)) &&
			binding.current === previous;
		const prepared: PreparedInputAttempt = {
			inputs,
			isCurrent,
			beginDelivery() {
				delivered = true;
			},
			commit() {
				if (!isCurrent()) return false;
				if (previous) {
					previous.receipt = receipt;
					previous.accepted = { attempt, inputs };
				}
				mounted.componentReceipt = receipt;
				binding.acceptedInputs = inputs;
				transferred = true;
				return true;
			},
			stop() {
				if (!transferred) restoreUndelivered();
			}
		};
		if (isCurrent()) binding.pending = prepared;
		return prepared;
	}
	const target: ReceiptAssociation = {
		mounted,
		owner: update?.owner,
		stopBindings: [],
		valid: true,
		receipt,
		committed: false,
		pending: false
	};
	let snapshot: InputSnapshot;
	const current = (candidate: object) =>
		mounted.scope.active &&
		target.valid &&
		binding.currentAttempt === candidate &&
		(target.committed || receivingCurrent());
	try {
		if (receipt.children.kind === 'reader') {
			target.scope = createEffectScope(mounted.scope);
			target.cell = withEffectScope(target.scope, () =>
				computedSnapshot(() => {
					const readAttempt = target.committed ? {} : attempt,
						acceptedAttempt = binding.currentAttempt;
					if (target.committed) {
						if (binding.current !== target) return target.accepted!;
						binding.currentAttempt = readAttempt;
					}
					try {
						const inputs = withEffectScope(target.scope ?? mounted.scope, () =>
							componentReceiptInputs(target.receipt)
						);
						return { attempt: readAttempt, inputs };
					} catch (error) {
						if (
							target.committed &&
							binding.current === target &&
							binding.currentAttempt === readAttempt
						)
							binding.currentAttempt = acceptedAttempt;
						throw error;
					}
				})
			);
			snapshot = target.cell.get();
		} else
			snapshot = {
				attempt,
				inputs: withEffectScope(mounted.scope, () => componentReceiptInputs(receipt))
			};
		if (current(snapshot.attempt)) {
			if (update) {
				const wide = 'words' in update.contract && typeof update.contract.words === 'number';
				const props = 'props' in update.contract && typeof update.contract.props === 'number';
				if (wide) {
					if (props) bindCompiledWideComponentUpdate(target, update.target, update.contract);
					else bindCompiledWideStateComponentUpdate(target, update.target, update.contract);
				} else if (props) bindCompiledComponentUpdate(target, update.target, update.contract);
				else bindCompiledStateComponentUpdate(target, update.target, update.contract);
				validateComponentReceiptSupplier(update);
			}
			if (target.cell) {
				const watch = withEffectScope(target.scope, () =>
					watchRetained(
						() => {
							const candidate = target.cell!.get();
							if (!target.committed) return;
							if (binding.current !== target || !current(candidate.attempt)) return;
							peek(() => publishInputSnapshot(target, candidate));
						},
						undefined,
						{ owned: true }
					)
				);
				if (watch) target.stopBindings.push(watch);
			}
		}
	} catch (error) {
		try {
			stopAssociation(target);
		} catch (cleanup) {
			attachSuppressedCleanupFailure(error, cleanup);
		}
		restoreUndelivered();
		throw error;
	}
	let transferred = false;
	const isCurrent = () =>
		mounted.scope.active &&
		target.valid &&
		binding.currentHandoff === handoff &&
		(transferred
			? binding.current === target
			: receivingCurrent() && binding.currentAttempt === snapshot.attempt);
	const prepared: PreparedInputAttempt = {
		inputs: snapshot.inputs,
		isCurrent,
		beginDelivery() {
			delivered = true;
		},
		commit() {
			if (!current(snapshot.attempt)) {
				stopAssociation(target);
				return false;
			}
			if (update) validateComponentReceiptSupplier(update);
			target.accepted = snapshot;
			target.committed = true;
			binding.current = target;
			mounted.componentReceipt = receipt;
			binding.acceptedInputs = snapshot.inputs;
			transferred = true;
			stopAssociation(previous);
			if (target.pending) applyCompiledComponentReceipt(target);
			return isCurrent();
		},
		stop() {
			if (!transferred) {
				try {
					stopAssociation(target);
				} finally {
					restoreUndelivered();
				}
			}
		}
	};
	binding.pending = prepared;
	return prepared;
}

function publishInputSnapshot(target: ReceiptAssociation, snapshot: InputSnapshot): void {
	const holder = target.mounted.componentReceiptBinding;
	if (
		!target.valid ||
		!target.mounted.scope.active ||
		holder?.current !== target ||
		holder.currentAttempt !== snapshot.attempt
	)
		return;
	const mounted = target.mounted;
	if (!mounted.clientArtifact || !mounted.instance) return;
	withSuppliedPlacementInputs(mounted.instance, () =>
		mounted.clientArtifact!.receive(
			mounted.instance!,
			snapshot.inputs.props,
			snapshot.inputs.children
		)
	);
	if (
		holder.current !== target ||
		holder.currentAttempt !== snapshot.attempt ||
		!mounted.scope.active
	)
		return;
	target.accepted = snapshot;
	holder.acceptedInputs = snapshot.inputs;
}

/** Completes first-mount/adoption membership after the selected artifact has attached. */
export function bindComponentReceiptUpdate(
	mounted: Mounted,
	receipt: AdmittedClientComponentInput
): void {
	const prepared =
		mounted.componentReceiptBinding?.pending ?? prepareComponentReceiptBinding(mounted, receipt);
	try {
		prepared.commit();
	} finally {
		if (mounted.componentReceiptBinding?.pending === prepared)
			mounted.componentReceiptBinding.pending = undefined;
		prepared.stop();
	}
}

/** Applies only the current supplier association, without borrowing another attempt's snapshot. */
export function applyCompiledComponentReceipt(binding: ExactRenderProgramBindingTarget): void {
	const target = binding as ReceiptAssociation;
	if (!target.valid || !target.mounted.scope.active) return;
	if (!target.committed) {
		target.pending = true;
		return;
	}
	target.pending = false;
	if (target.receipt.update) validateComponentReceiptSupplier(target.receipt.update);
	if (target.cell) {
		const candidate = target.cell.get();
		peek(() => publishInputSnapshot(target, candidate));
		return;
	}
	const holder = target.mounted.componentReceiptBinding;
	if (holder?.current !== target) return;
	const attempt = {};
	holder.currentAttempt = attempt;
	const inputs = withEffectScope(target.mounted.scope, () =>
		componentReceiptInputs(target.receipt)
	);
	peek(() => publishInputSnapshot(target, { attempt, inputs }));
}

/** Reads the already acquired accepted/provisional inputs without invoking authored demand. */
export function acquiredComponentChildren(
	mounted: Mounted
): readonly import('@exactjs/core').Child[] {
	const binding = mounted.componentReceiptBinding;
	return binding?.pending?.isCurrent()
		? binding.pending.inputs.children
		: (binding?.acceptedInputs?.children ?? []);
}
