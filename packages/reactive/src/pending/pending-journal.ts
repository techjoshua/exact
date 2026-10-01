import { batch } from '../internal/deps.js';

/** Supplies framework ownership without coupling reactive transactions to tasks or components. */
export interface PendingTransactionOptions {
	/** Rejects work whose framework owner is no longer current. */
	assertCurrent?(): void;
	/** Transfers ordered publication callbacks to a host journal. The host must batch publication. */
	stage?(mutation: () => void): void;
	/** Supplies framework-specific suspension and cancellation without an ambient transaction. */
	await?<Value>(value: Value | PromiseLike<Value>): Promise<Value>;
	/** Recognizes a host facade that exposes the root without adopting unrelated mutable objects. */
	owns?(value: object, root: object): boolean;
}

/** Owns publication ordering and releases pending storage without scanning untouched receivers. */
export class PendingTransactionJournal {
	private mutations?: Array<() => void>;
	private closed = false;
	/** Publication reads committed storage instead of replaying final pending values through setters. */
	publishing = false;

	constructor(
		private readonly options: PendingTransactionOptions,
		private readonly release: () => void
	) {
		this.stage(() => {
			this.publishing = true;
			this.release();
		});
	}

	/** Checks explicit journal lifetime and the host's generation before owned work executes. */
	assertCurrent(): void {
		this.options.assertCurrent?.();
		if (this.closed) throw new TypeError('Pending reactive transaction is closed');
	}

	/** Captures a publication callback locally or transfers it to the framework's ordered journal. */
	stage(mutation: () => void): void {
		this.assertCurrent();
		const guarded = () => {
			this.assertCurrent();
			mutation();
		};
		if (this.options.stage) this.options.stage(guarded);
		else (this.mutations ??= []).push(guarded);
	}

	/** Commits a standalone journal atomically and releases captured callbacks even if publication fails. */
	commit(): void {
		this.assertCurrent();
		if (this.options.stage) throw new TypeError('Framework host owns transaction publication');
		const mutations = this.mutations;
		this.mutations = undefined;
		try {
			batch(() => {
				for (const mutation of mutations ?? []) mutation();
			});
		} finally {
			this.closed = true;
			this.release();
		}
	}

	/** Discards captured work and makes externally retained pending views reject further owned writes. */
	discard(): void {
		this.closed = true;
		this.mutations = undefined;
		this.release();
	}

	/** Closes a host-owned journal after its callbacks finish, fencing escaped mutation capabilities. */
	finishPublication(): void {
		this.closed = true;
		this.mutations = undefined;
		this.release();
	}
}
