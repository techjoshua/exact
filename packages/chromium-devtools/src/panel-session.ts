import type { ExactInspectionRuntimeId } from '@exactjs/devtools-protocol';
import type { ExactExtensionQueryClient } from './messages.js';
import { loadExactDevtoolsPanelModel, type ExactDevtoolsPanelModel } from './panel-model.js';

/** Disposable connection and live-event owner for one Chromium panel instance. */
export interface ExactDevtoolsPanelSession {
	load(selected?: ExactInspectionRuntimeId): Promise<ExactDevtoolsPanelModel>;
	dispose(): Promise<void>;
}

/** Creates a panel session whose queries and events use only the shared protocol client. */
export function createExactDevtoolsPanelSession(
	client: ExactExtensionQueryClient,
	onEvent: () => void
): ExactDevtoolsPanelSession {
	let subscription: Readonly<{ close(): Promise<void> }> | undefined;
	let sessionId: string | undefined;
	let disposed = false;
	return Object.freeze({
		async load(selected?: ExactInspectionRuntimeId) {
			if (disposed) throw new Error('eXact DevTools panel session is disposed');
			const model = await loadExactDevtoolsPanelModel(client, selected);
			if (sessionId !== model.sessionId) {
				await subscription?.close();
				sessionId = model.sessionId;
				subscription = await client.subscribe(
					model.sessionId,
					model.timeline.at(-1)?.cursor,
					onEvent
				);
			}
			return model;
		},
		async dispose() {
			if (disposed) return;
			disposed = true;
			await subscription?.close();
			subscription = undefined;
			sessionId = undefined;
			await client.disconnect();
		}
	});
}
