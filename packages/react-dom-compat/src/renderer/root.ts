import type { ReactNode } from '@exactjs/react-compat';
import { ErrorContext, createErrorContext } from '@exactjs/core';
import {
	createReactRendererRootContexts,
	reactErrorOwnerName,
	type ReactRootRuntime
} from '@exactjs/react-compat/exact';
import type { RootOptions } from '../client.js';
import { disposeReactMounted, reconcileReactChildren } from './tree.js';
import type { ReactRendererRoot } from './types.js';
import { adoptReactRootMarkup } from './hydration-adoption.js';
import {
	createStandaloneCompatibilityRangeHost,
	type ExactCompatibilityRangeHost
} from '@exactjs/dom/runtime/compatibility-ranges';

/** Creates one isolated React renderer root without entering eXact's native DOM renderer. */
export function createReactRendererRoot(
	container: Element,
	options?: RootOptions
): ReactRendererRoot {
	const runtime: ReactRootRuntime = {
		identifierPrefix: options?.identifierPrefix ?? '',
		nextComponentId: 0,
		onCaughtError: options?.onCaughtError
	};
	const contexts = new Map<symbol, unknown>(createReactRendererRootContexts(runtime));
	const errors = createErrorContext();
	contexts.set(ErrorContext.id, {
		...errors,
		report(error: unknown, reportOptions?: Parameters<typeof errors.report>[1]) {
			const report = errors.report(error, reportOptions);
			const name = reactErrorOwnerName(report.error);
			options?.onUncaughtError?.(report.error, {
				componentStack: name ? `\n    at ${name}` : ''
			});
			return report;
		}
	});
	return {
		container,
		mounted: [],
		contexts,
		runtime,
		...(options ? { options } : {}),
		active: true,
		rendering: false,
		nativeHost: createStandaloneCompatibilityRangeHost(container)
	};
}

/** Creates a React-owned renderer range within a native owner without converting either tree. */
export function createReactRendererRangeRoot(
	container: Node,
	before: Node,
	contexts: ReactRendererRoot['contexts'],
	runtime: ReactRootRuntime,
	nativeHost: ExactCompatibilityRangeHost
): ReactRendererRoot {
	return {
		container,
		before,
		mounted: [],
		contexts,
		runtime,
		active: true,
		rendering: false,
		nativeHost
	};
}

/** Publishes the next React tree through React-owned reconciliation. */
export function renderReactRoot(root: ReactRendererRoot, value: ReactNode): void {
	if (!root.active) throw new Error('Cannot update an unmounted React compatibility root');
	if (root.rendering) {
		root.pending = value;
		return;
	}
	root.rendering = true;
	let next = value;
	try {
		do {
			root.pending = undefined;
			root.runtime.onCaughtError = root.options?.onCaughtError;
			root.mounted = reconcileReactChildren(
				{ root, parent: root.container },
				root.mounted,
				next,
				root.before ?? null
			);
			if (root.pending !== undefined) next = root.pending;
		} while (root.pending !== undefined);
	} catch (error) {
		reportReactRootError(root, error);
		throw error;
	} finally {
		root.rendering = false;
	}
}

/** Releases the complete React-owned tree and invalidates future root updates. */
export function disposeReactRoot(root: ReactRendererRoot): void {
	if (!root.active) return;
	root.active = false;
	for (const mounted of root.mounted) disposeReactMounted(mounted);
	root.mounted = [];
}

/** Rebuilds server markup only when the current renderer cannot yet adopt it in place. */
export function hydrateReactRoot(root: ReactRendererRoot, value: ReactNode): void {
	if (
		root.container instanceof Element &&
		root.container.childNodes.length &&
		adoptReactRootMarkup(root, value)
	)
		return;
	if (!(root.container instanceof Element)) {
		renderReactRoot(root, value);
		return;
	}
	const formState = captureFormState(root.container);
	if (root.container.childNodes.length) {
		root.container.replaceChildren();
		root.options?.onRecoverableError?.(
			new Error('React compatibility rebuilt server markup that could not be adopted'),
			{ componentStack: '' }
		);
	}
	renderReactRoot(root, value);
	restoreFormState(root.container, formState);
}

/** Adopts one bounded React-owned range already delimited by its native owner. */
export function hydrateReactRangeRoot(
	root: ReactRendererRoot,
	value: ReactNode,
	start: Node,
	end: Node
): boolean {
	root.hydrationStart = start.nextSibling;
	root.hydrationEnd = end;
	const adopted = adoptReactRootMarkup(root, value);
	delete root.hydrationStart;
	delete root.hydrationEnd;
	return adopted;
}

function reportReactRootError(root: ReactRendererRoot, error: unknown): void {
	const name = reactErrorOwnerName(error);
	root.options?.onUncaughtError?.(error, {
		componentStack: name ? `\n    at ${name}` : ''
	});
}

type FormState = ReadonlyMap<string, Readonly<{ value?: string; checked?: boolean }>>;

function captureFormState(container: Element): FormState {
	const state = new Map<string, { value?: string; checked?: boolean }>();
	for (const control of container.querySelectorAll<
		HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
	>('input[name],textarea[name],select[name]')) {
		const key = control.getAttribute('name');
		if (!key) continue;
		state.set(key, {
			value: control.value,
			...('checked' in control ? { checked: control.checked } : {})
		});
	}
	return state;
}

function restoreFormState(container: Element, state: FormState): void {
	for (const control of container.querySelectorAll<
		HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
	>('input[name],textarea[name],select[name]')) {
		const key = control.getAttribute('name');
		const previous = key ? state.get(key) : undefined;
		if (!previous) continue;
		if (previous.value !== undefined) control.value = previous.value;
		if ('checked' in control && previous.checked !== undefined) control.checked = previous.checked;
	}
}
