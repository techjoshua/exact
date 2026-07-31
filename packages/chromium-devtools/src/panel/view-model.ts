import type {
	ExactInspectedRuntimeComponent,
	ExactInspectionRuntimeId,
	ExactRuntimeInspectionEvent
} from '@exactjs/devtools-protocol';

/** One durable component instance and its live child-instance hierarchy. */
export type ExactComponentTreeNode = Readonly<{
	component: ExactInspectedRuntimeComponent;
	children: readonly ExactComponentTreeNode[];
}>;

/** One causal profiler frame containing ordered runtime events. */
export type ExactProfilerFrame = Readonly<{
	id: string;
	label: string;
	start: number;
	end: number;
	events: readonly ExactRuntimeInspectionEvent[];
}>;

/** Produces the stable identity key used only for panel selection and hierarchy joins. */
export function exactPanelIdentityKey(id: ExactInspectionRuntimeId): string {
	return [
		id.side,
		id.binding ?? '',
		id.buildKey,
		id.executionRoot,
		id.componentTypeId,
		id.instanceId ?? '',
		id.sourceEntityId ?? '',
		id.operationId ?? '',
		id.generation ?? ''
	].join('\u001f');
}

/** Produces the build/root-scoped key for one authored component type. */
export function exactPanelComponentTypeKey(id: ExactInspectionRuntimeId): string {
	return [id.binding ?? '', id.buildKey, id.executionRoot, id.componentTypeId].join('\u001f');
}

/** Builds the durable instance forest without assuming parents precede children. */
export function buildExactComponentForest(
	components: readonly ExactInspectedRuntimeComponent[]
): readonly ExactComponentTreeNode[] {
	type MutableNode = {
		component: ExactInspectedRuntimeComponent;
		children: MutableNode[];
	};
	const nodes = new Map<string, MutableNode>();
	for (const component of components)
		nodes.set(exactPanelIdentityKey(component.id), { component, children: [] });
	const roots: MutableNode[] = [];
	for (const node of nodes.values()) {
		const parent = node.component.parent
			? nodes.get(exactPanelIdentityKey(node.component.parent))
			: undefined;
		if (parent && parent !== node) parent.children.push(node);
		else roots.push(node);
	}
	return roots;
}

/**
 * Groups captured events into explicit task frames first and correlation frames otherwise.
 *
 * Frame-enter/frame-exit events define a synchronous capture interval. Events outside those
 * intervals are grouped by interaction or request identity; uncorrelated events remain separate.
 */
export function buildExactProfilerFrames(
	events: readonly ExactRuntimeInspectionEvent[]
): readonly ExactProfilerFrame[] {
	type MutableFrame = {
		id: string;
		label: string;
		start: number;
		end: number;
		events: ExactRuntimeInspectionEvent[];
		explicit: boolean;
	};
	const ordered = [...events].sort((left, right) => left.sequence - right.sequence);
	const frames: MutableFrame[] = [];
	const active: MutableFrame[] = [];
	const correlated = new Map<string, MutableFrame>();
	for (const event of ordered) {
		if (event.kind === 'task.frame.enter') {
			const frame: MutableFrame = {
				id: `frame:${event.cursor}`,
				label: eventLabel(event, 'Frame'),
				start: event.timestamp,
				end: event.timestamp,
				events: [event],
				explicit: true
			};
			for (const parent of active) appendEvent(parent, event);
			active.push(frame);
			frames.push(frame);
			continue;
		}
		if (active.length) {
			for (const frame of active) appendEvent(frame, event);
			if (event.kind === 'task.frame.exit') active.pop();
			continue;
		}
		const correlation = event.interactionId
			? `interaction:${event.interactionId}`
			: event.requestId
				? `request:${event.requestId}`
				: undefined;
		if (!correlation) {
			frames.push({
				id: `event:${event.cursor}`,
				label: eventLabel(event),
				start: event.timestamp,
				end: event.timestamp,
				events: [event],
				explicit: false
			});
			continue;
		}
		let frame = correlated.get(correlation);
		if (!frame) {
			frame = {
				id: correlation,
				label: event.interactionId ? 'Interaction' : 'Request',
				start: event.timestamp,
				end: event.timestamp,
				events: [],
				explicit: false
			};
			correlated.set(correlation, frame);
			frames.push(frame);
		}
		appendEvent(frame, event);
	}
	return frames.map(({ explicit: _explicit, ...frame }) => frame);
}

/** Resolves the most useful component label available for one event. */
export function exactEventComponentName(
	event: ExactRuntimeInspectionEvent,
	components: readonly ExactInspectedRuntimeComponent[]
): string {
	const key = exactPanelIdentityKey({
		...event.id,
		sourceEntityId: undefined,
		operationId: undefined,
		generation: undefined
	});
	return (
		components.find((component) => exactPanelIdentityKey(component.id) === key)?.name ??
		event.id.componentTypeId.replace(/^component:/, '')
	);
}

/** Formats profiler durations without implying precision beyond the captured timestamps. */
export function formatExactProfilerDuration(milliseconds: number): string {
	if (milliseconds < 0.1) return '<0.1 ms';
	if (milliseconds < 1000) return `${milliseconds.toFixed(milliseconds < 10 ? 2 : 1)} ms`;
	return `${(milliseconds / 1000).toFixed(2)} s`;
}

function appendEvent(
	frame: { end: number; events: ExactRuntimeInspectionEvent[] },
	event: ExactRuntimeInspectionEvent
): void {
	frame.events.push(event);
	frame.end = Math.max(frame.end, event.timestamp);
}

function eventLabel(event: ExactRuntimeInspectionEvent, fallback?: string): string {
	const authored =
		typeof event.attributes?.name === 'string'
			? event.attributes.name
			: event.id.sourceEntityId?.split(':').at(-1);
	return authored || fallback || event.kind.replaceAll('.', ' ');
}
