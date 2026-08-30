import { decodedMappings, TraceMap } from '@jridgewell/trace-mapping';
import { preciseExecutedIntervals } from './precise-coverage.mjs';

/** Attributes generated, executed, and function inventory to original source-map modules. */
export function attributeClientModules({ code, sourceMap, coverage, functionSites = [] }) {
	const trace = new TraceMap(sourceMap);
	const offsets = lineOffsets(code);
	const segments = generatedSourceSegments(trace, offsets, code.length);
	const ranges = coverage.functions.flatMap((entry) => entry.ranges);
	const executed = preciseExecutedIntervals(ranges);
	const modules = new Map();
	for (const segment of segments) {
		const entry = moduleEntry(modules, segment.source);
		entry.generatedBytes += segment.endOffset - segment.startOffset;
		entry.executedBytes += overlapBytes(segment, executed);
	}
	for (const fn of coverage.functions) {
		const source = sourceAtOffset(segments, fn.ranges[0]?.startOffset);
		if (!source) continue;
		const entry = moduleEntry(modules, source);
		entry.profiledFunctions++;
		if (fn.ranges.some((range) => range.count > 0)) entry.invokedFunctions++;
	}
	for (const site of functionSites) {
		const source = sourceAtOffset(segments, site.startOffset);
		if (!source) continue;
		const entry = moduleEntry(modules, source);
		if (site.kind === 'parsed') entry.parsedFunctions++;
		else if (site.kind === 'compiled') entry.compiledFunctions++;
	}
	return [...modules.values()]
		.filter((entry) => entry.generatedBytes > 0)
		.sort((left, right) => right.executedBytes - left.executedBytes);
}

function generatedSourceSegments(trace, offsets, codeLength) {
	const mappings = decodedMappings(trace);
	const sources = trace.resolvedSources;
	const segments = [];
	for (let line = 0; line < mappings.length; line++) {
		const entries = mappings[line];
		const lineStart = offsets[line] ?? codeLength;
		const lineEnd = offsets[line + 1] ?? codeLength;
		for (let index = 0; index < entries.length; index++) {
			const mapping = entries[index];
			if (mapping.length < 4 || mapping[1] === undefined) continue;
			const startOffset = Math.min(lineEnd, lineStart + mapping[0]);
			const endOffset = Math.min(
				lineEnd,
				lineStart + (entries[index + 1]?.[0] ?? lineEnd - lineStart)
			);
			if (endOffset <= startOffset) continue;
			segments.push({
				source: sources[mapping[1]] ?? trace.sources[mapping[1]],
				startOffset,
				endOffset
			});
		}
	}
	return segments;
}

function lineOffsets(code) {
	const offsets = [0];
	for (let index = 0; index < code.length; index++)
		if (code.charCodeAt(index) === 10) offsets.push(index + 1);
	return offsets;
}

function overlapBytes(segment, intervals) {
	let bytes = 0;
	for (const interval of intervals) {
		if (interval.endOffset <= segment.startOffset) continue;
		if (interval.startOffset >= segment.endOffset) break;
		bytes +=
			Math.min(segment.endOffset, interval.endOffset) -
			Math.max(segment.startOffset, interval.startOffset);
	}
	return bytes;
}

function sourceAtOffset(segments, offset) {
	if (!Number.isSafeInteger(offset)) return undefined;
	return segments.find((segment) => segment.startOffset <= offset && offset < segment.endOffset)
		?.source;
}

function moduleEntry(modules, source) {
	let entry = modules.get(source);
	if (entry) return entry;
	entry = {
		source,
		generatedBytes: 0,
		executedBytes: 0,
		parsedFunctions: 0,
		compiledFunctions: 0,
		profiledFunctions: 0,
		invokedFunctions: 0
	};
	modules.set(source, entry);
	return entry;
}
