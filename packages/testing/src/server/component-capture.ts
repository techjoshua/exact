import type { AnyComponentFunction } from '@exactjs/core';
import { snapshot } from '@exactjs/reactive';
import type { RenderToStringOptions } from '@exactjs/ssr';

/** Settled values and logical identity retained after a server frame is disposed. */
export type CapturedComponent = {
	id: string;
	type: AnyComponentFunction;
	state: unknown;
	props: unknown;
	parentId?: string;
	provided: Map<symbol, unknown>;
	ambient: Map<symbol, unknown>;
};

type DirectSnapshot = Parameters<NonNullable<RenderToStringOptions['onDirectComponentCreated']>>[0];

/** Captures compiler-owned frames in creation order and rolls back abandoned descendants. */
export function createServerComponentCapture() {
	const entries: DirectSnapshot[] = [];
	const values = new Map<object, CapturedComponent>();
	const ids = new WeakMap<object, string>();
	let nextId = 0;
	const idFor = (host: object): string => {
		let id = ids.get(host);
		if (!id) ids.set(host, (id = `server-test:${++nextId}`));
		return id;
	};
	return {
		options: {
			onDirectComponentCreated(entry) {
				entries.push(entry);
			},
			onDirectComponentRendered(entry) {
				values.set(entry.host, {
					id: idFor(entry.host),
					type: entry.contract.artifact.instantiate,
					state: snapshot(entry.state),
					props: snapshot(entry.props),
					parentId: entry.host.parent ? idFor(entry.host.parent) : undefined,
					provided: new Map(
						[...(entry.host.contexts ?? [])].map(([key, value]) => [key, snapshot(value)])
					),
					ambient: new Map(
						[...(entry.host.ambientContexts ?? [])].map(([key, value]) => [key, snapshot(value)])
					)
				});
			},
			onComponentAttemptCheckpoint: () => entries.length,
			onComponentAttemptRollback(checkpoint) {
				for (const entry of entries.splice(checkpoint as number)) values.delete(entry.host);
			}
		} satisfies RenderToStringOptions,
		read(): CapturedComponent[] {
			return entries.map((entry) => {
				const value = values.get(entry.host);
				if (!value) throw new Error('Server component observation did not settle');
				return value;
			});
		}
	};
}
