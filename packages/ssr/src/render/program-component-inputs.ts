import {
	claimPreparedServerComponentOccurrence,
	type ServerComponentReference
} from './server-component-reference.js';
import type { RenderValue } from './execution.js';
import type { SsrProgramWriterOutput } from './program-writer-output.js';

/**
 * Selects by the program's retained slot position before validating the carried source identity.
 * Arrays and unprepared values keep ordinary traversal. No raw-identity search selects an input.
 */
export function claimProgramComponentInput(
	output: SsrProgramWriterOutput<unknown>,
	value: unknown
): RenderValue<ServerComponentReference | undefined> {
	const position = output.componentInputPosition ?? 0;
	output.componentInputPosition = position + 1;
	const frame = output.preparation?.frame;
	if (!output.target || !frame) return;
	const entry = frame.entries[frame.cursor];
	if (!entry || entry.position > position) return;
	if (entry.position !== position)
		throw new TypeError('SSR program input positions were not consumed in source order');
	if (entry.kind !== 'component') return;
	if (entry.record.reference.source !== value)
		throw new TypeError('SSR program input occurrence does not match its retained source');
	frame.cursor++;
	return claimPreparedServerComponentOccurrence(
		output.context,
		entry.record.reference,
		entry.record
	);
}
