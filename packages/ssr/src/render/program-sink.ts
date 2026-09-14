import type { RenderValue } from './execution.js';

/**
 * Request-owned destination for ordered render-program spans.
 * The destination owns buffering and byte limits. A write accepts its entire span;
 * the renderer checks readiness before producing another span. Destruction and
 * final hydration publication belong to the request owner, not individual programs.
 * A terminal destination failure must cancel the request's task signal, allowing
 * pending descendants to settle and release their scopes before their parents.
 */
export interface SsrProgramSink {
	/** Accepts one completed span, retaining its order even when transport pressure begins. */
	write(html: string): void;
	/** Optionally retains a compiler-known document edge without publishing it to the transport. */
	captureDocumentBoundary?(): void;
	/** Returns a pending drain only when the destination cannot accept the next span. */
	ready(): RenderValue<void>;
	/** Publishes buffered output at a completed head or before awaiting descendant work. */
	flush(reason: 'head' | 'await'): RenderValue<void>;
}

/** Flushes before actual suspension and retains descendant ownership through a failing drain. */
export function awaitSsrProgramSink<T>(
	sink: SsrProgramSink | undefined,
	value: Promise<T>
): Promise<T> {
	if (!sink) return value;
	let drain: RenderValue<void>;
	try {
		drain = sink.flush('await');
	} catch (error) {
		return value.then(
			() => {
				throw error;
			},
			() => {
				throw error;
			}
		);
	}
	return drain instanceof Promise ? settleProgramFlush(value, drain) : value;
}

/** A failed drain cannot unwind a parent's scope while its descendant still owns it. */
async function settleProgramFlush<T>(value: Promise<T>, drain: Promise<void>): Promise<T> {
	try {
		const [result] = await Promise.all([value, drain]);
		return result;
	} finally {
		// The destination cancels request tasks. Retain ownership until their
		// cleanup finishes even when the transport failed before the child did.
		await value.then(
			() => undefined,
			() => undefined
		);
	}
}
