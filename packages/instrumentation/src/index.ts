/** Scalar metadata safe to serialize in profiling reports. */
export type ExactProfileValue = string | number | boolean | null;

/** Common envelope implemented by profiling events from every eXact package. */
export type ExactProfileEvent<
  Subsystem extends string = string,
  Phase extends string = string
> = Readonly<{
  subsystem: Subsystem;
  phase: Phase;
  elapsedMs: number;
  operationId?: string;
  parentOperationId?: string;
  attributes?: Readonly<Record<string, ExactProfileValue>>;
  counts?: Readonly<Record<string, number>>;
}>;

/** Synchronous destination for immutable profiling observations. */
export type ExactProfileSink<Event extends ExactProfileEvent = ExactProfileEvent> = (
  event: Event
) => void;

/** In-memory profile collector intended for tests, benchmarks, and tooling. */
export interface ExactProfileCollector<Event extends ExactProfileEvent = ExactProfileEvent> {
  readonly sink: ExactProfileSink<Event>;
  snapshot(): readonly Event[];
  clear(): void;
}

/** Aggregated elapsed time and event count for one subsystem phase. */
export type ExactProfilePhaseSummary = Readonly<{
  subsystem: string;
  phase: string;
  elapsedMs: number;
  events: number;
}>;

/** Returns a monotonic high-resolution timestamp when the host provides one. */
export function profileTimestamp(): number {
  const runtime = globalThis as typeof globalThis & {
    performance?: { now(): number };
  };
  return runtime.performance?.now() ?? Date.now();
}

/**
 * Creates an ordered in-memory collector without installing global state.
 *
 * Callers explicitly pass the returned sink into the runtime being observed,
 * which keeps concurrent applications and requests isolated.
 */
export function createProfileCollector<
  Event extends ExactProfileEvent = ExactProfileEvent
>(): ExactProfileCollector<Event> {
  const events: Event[] = [];
  return Object.freeze({
    sink: (event: Event) => { events.push(event); },
    snapshot: () => Object.freeze([...events]),
    clear: () => { events.length = 0; }
  });
}

/** Summarizes ordered observations without discarding the original event stream. */
export function summarizeProfile(
  events: Iterable<ExactProfileEvent>
): readonly ExactProfilePhaseSummary[] {
  const summaries = new Map<string, {
    subsystem: string;
    phase: string;
    elapsedMs: number;
    events: number;
  }>();
  for (const event of events) {
    const key = `${event.subsystem}\0${event.phase}`;
    const summary = summaries.get(key) ?? {
      subsystem: event.subsystem,
      phase: event.phase,
      elapsedMs: 0,
      events: 0
    };
    summary.elapsedMs += event.elapsedMs;
    summary.events++;
    summaries.set(key, summary);
  }
  return Object.freeze(
    [...summaries.values()]
      .sort((left, right) => right.elapsedMs - left.elapsedMs)
      .map(summary => Object.freeze(summary))
  );
}
