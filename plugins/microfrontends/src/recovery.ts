import type { ExactClient, ExactResponseMetadata } from '@exact/hydrate';
import type { ExactRemoteModule } from './artifacts.js';
import { loadExactRemoteModule, type ExactRemoteClientBinding } from './client.js';

type RecoveryMember = {
	readonly client: ExactClient;
	replace(module: ExactRemoteModule): void;
	fail(): void;
};

/** Controls one remote instance's membership in coordinated build replacement. */
export type ExactRemoteRecoveryRegistration = {
	response(metadata: ExactResponseMetadata): void;
	unsupported(): void;
	unregister(): void;
};

const coordinators = new Map<string, RecoveryCoordinator>();
const buildKeyPattern = /^[0-9a-f]{40}$/i;

/** Joins one live remote instance to the replacement coordinator for its loaded build. */
export function registerExactRemoteRecovery(
	bindingName: string,
	binding: ExactRemoteClientBinding,
	module: ExactRemoteModule,
	member: RecoveryMember
): ExactRemoteRecoveryRegistration {
	const key = `${bindingName}\0${module.buildKey}`;
	let coordinator = coordinators.get(key);
	if (!coordinator) {
		coordinator = new RecoveryCoordinator(key, binding, module.buildKey, module.root);
		coordinators.set(key, coordinator);
	}
	coordinator.add(member);
	return {
		response: (metadata) => coordinator!.response(metadata),
		unsupported: () => coordinator!.unsupported(),
		unregister: () => {
			coordinator!.remove(member);
			if (!coordinator!.size) coordinators.delete(key);
		}
	};
}

class RecoveryCoordinator {
	readonly #members = new Set<RecoveryMember>();
	#preferredBuild: string | undefined;
	#preparation: Promise<ExactRemoteModule> | undefined;
	#replacement: Promise<void> | undefined;
	#attempted = false;
	#stale = false;

	constructor(
		readonly key: string,
		readonly binding: ExactRemoteClientBinding,
		readonly currentBuild: string,
		readonly root: string
	) {}

	get size(): number {
		return this.#members.size;
	}

	add(member: RecoveryMember): void {
		this.#members.add(member);
		if (this.#stale) member.client.retire();
	}

	remove(member: RecoveryMember): void {
		this.#members.delete(member);
	}

	response(metadata: ExactResponseMetadata): void {
		const preferred = metadata.preferredBuildKey;
		if (
			this.#stale ||
			!preferred ||
			!buildKeyPattern.test(preferred) ||
			preferred === this.currentBuild ||
			!this.binding.resolveClientEntry
		)
			return;
		if (this.#preferredBuild && this.#preferredBuild !== preferred) return;
		this.#preferredBuild = preferred;
		this.#schedule(preferred);
	}

	unsupported(): void {
		if (this.#attempted) return;
		this.#attempted = true;
		this.#stale = true;
		for (const member of this.#members) member.client.retire();
		this.#schedule(this.#preferredBuild);
	}

	#schedule(preferred: string | undefined): void {
		if (this.#replacement) return;
		let failed = false;
		this.#replacement = this.#prepare(preferred)
			.then((module) => this.#commitWhenSettled(module))
			.catch(() => {
				failed = true;
			})
			.finally(() => {
				if (failed && this.#stale) for (const member of [...this.#members]) member.fail();
				if (failed || !this.#stale) {
					this.#preparation = undefined;
					this.#replacement = undefined;
				}
			});
	}

	#prepare(preferred: string | undefined): Promise<ExactRemoteModule> {
		if (this.#preparation) return this.#preparation;
		this.#preparation = this.#resolveEntry(preferred)
			.then(loadExactRemoteModule)
			.then((module) => {
				if (module.buildKey === this.currentBuild)
					throw new Error('Replacement eXact remote module did not change its build key');
				if (preferred && module.buildKey !== preferred)
					throw new Error('Replacement eXact remote module did not match the preferred build key');
				if (module.root !== this.root)
					throw new Error('Replacement eXact remote module changed its execution root');
				return module;
			});
		return this.#preparation;
	}

	async #resolveEntry(preferred: string | undefined): Promise<string> {
		if (preferred && this.binding.resolveClientEntry)
			return this.binding.resolveClientEntry(preferred);
		return cacheBustedEntry(this.binding.clientEntry, this.currentBuild);
	}

	async #commitWhenSettled(module: ExactRemoteModule): Promise<void> {
		while (this.#members.size) {
			const members = [...this.#members];
			await Promise.all(members.map((member) => member.client.whenSettled()));
			if (members.every((member) => !member.client.pendingRequests)) {
				for (const member of members) member.client.retire();
				for (const member of members) member.replace(module);
				return;
			}
		}
	}
}

function cacheBustedEntry(entry: string, currentBuild: string): string {
	const separator = entry.includes('?') ? '&' : '?';
	return `${entry}${separator}__exact_reload=${encodeURIComponent(currentBuild)}`;
}
