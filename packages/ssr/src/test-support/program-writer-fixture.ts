import type { SsrContext } from '../types.js';
import { mapRenderValue, type RenderValue } from '../render/execution.js';
import { writeProgramChild } from '../render/program-boundary.js';
import {
	renderProgramWriter,
	type SsrProgramWriterOutput
} from '../render/program-writer-output.js';

/** Test-only ordered writer fixture for pressure and lifecycle cases independent of emitted syntax. */
export function renderWriterSequence<T extends object>(
	context: SsrContext,
	steps: readonly (string | T)[],
	render: (value: T) => RenderValue<string>,
	host?: string
): RenderValue<string> {
	return renderProgramWriter<T>(context, host, undefined, (output) => resume(output, 0), render);
	function resume(
		output: SsrProgramWriterOutput<T>,
		start: number
	): RenderValue<SsrProgramWriterOutput<T>> {
		for (let index = start; index < steps.length; index++) {
			const step = steps[index]!;
			const pending =
				typeof step === 'string'
					? output.sink.write(step)
					: writeProgramChild(context, output, step, '', 0, true);
			if (pending instanceof Promise)
				return pending.then(() =>
					mapRenderValue(output.sink.ready(), () => resume(output, index + 1))
				);
			const drain = output.sink.ready();
			if (drain instanceof Promise) return drain.then(() => resume(output, index + 1));
		}
		return output;
	}
}
