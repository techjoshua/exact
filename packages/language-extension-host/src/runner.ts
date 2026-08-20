#!/usr/bin/env node
import {
	exactLanguageProtocolLimits,
	type ExactLanguageAnalyzer,
	type ExactLanguageAnalyzerFactory,
	type ExactLanguageJsonValue
} from '@exactjs/language-extension-api';
import { pathToFileURL } from 'node:url';
import type {
	ExactLanguageRunnerCancel,
	ExactLanguageRunnerInitialize,
	ExactLanguageRunnerRequest,
	ExactLanguageRunnerResponse
} from './runner-protocol.js';
import { readBoundedLines } from './bounded-lines.js';

let analyzer: ExactLanguageAnalyzer | undefined;
const active = new Map<number, AbortController>();
const stopInput = readBoundedLines(
	process.stdin,
	exactLanguageProtocolLimits.responseBytes,
	(line) => void dispatch(line),
	(error) => {
		process.stderr.write(`${error.message}\n`);
		process.exitCode = 1;
		stopInput();
	}
);
process.stdin.once('end', () => void analyzer?.dispose?.());

async function dispatch(line: string): Promise<void> {
	let frame: ExactLanguageRunnerInitialize | ExactLanguageRunnerRequest | ExactLanguageRunnerCancel;
	try {
		frame = JSON.parse(line) as typeof frame;
	} catch (error) {
		process.stderr.write(`Invalid language-runner frame: ${String(error)}\n`);
		return;
	}
	if (frame.method === 'cancel') {
		active.get(frame.requestId)?.abort(new Error('Language request cancelled'));
		return;
	}
	const controller = new AbortController();
	active.set(frame.id, controller);
	try {
		if (frame.method === 'initialize') {
			const imported = (await import(pathToFileURL(frame.entry).href)) as Record<string, unknown>;
			const factory = imported.createExactLanguageAnalyzer as
				| ExactLanguageAnalyzerFactory
				| undefined;
			if (typeof factory !== 'function')
				throw new Error('Analyzer entry must export createExactLanguageAnalyzer');
			analyzer = await factory(frame.context);
			respond({ protocol: 1, id: frame.id, result: true });
			return;
		}
		if (!analyzer) throw new Error('Language runner has not initialized');
		if (frame.method === 'shutdown') {
			await analyzer.dispose?.();
			analyzer = undefined;
			respond({ protocol: 1, id: frame.id, result: true });
			stopInput();
			return;
		}
		if (frame.method === 'invalidate') {
			await analyzer.invalidate?.(Number(frame.params));
			respond({ protocol: 1, id: frame.id, result: true });
			return;
		}
		const result = await invokeAnalyzer(analyzer, frame, controller.signal);
		if (!controller.signal.aborted)
			respond({
				protocol: 1,
				id: frame.id,
				result: (result ?? null) as unknown as ExactLanguageJsonValue
			});
	} catch (error) {
		if (!controller.signal.aborted)
			respond({
				protocol: 1,
				id: frame.id,
				error: {
					message: error instanceof Error ? error.message : String(error),
					...(error instanceof Error && error.stack ? { stack: error.stack } : {})
				}
			});
	} finally {
		active.delete(frame.id);
	}
}

async function invokeAnalyzer(
	current: ExactLanguageAnalyzer,
	frame: ExactLanguageRunnerRequest,
	signal: AbortSignal
): Promise<unknown> {
	if (frame.method === 'diagnostics') return current.diagnostics(frame.params as never, signal);
	if (frame.method === 'completions' && current.complete)
		return current.complete(frame.params as never, signal);
	if (frame.method === 'hover' && current.hover)
		return current.hover(frame.params as never, signal);
	if (frame.method === 'inlayHints' && current.inlayHints)
		return current.inlayHints(frame.params as never, signal);
	if (frame.method === 'codeActions' && current.codeActions)
		return current.codeActions(frame.params as never, signal);
	throw new Error(`Analyzer does not implement ${frame.method}`);
}

function respond(frame: ExactLanguageRunnerResponse): void {
	process.stdout.write(`${JSON.stringify(frame)}\n`);
}
