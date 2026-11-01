import { Writable } from 'node:stream';
import type { ReactNode } from '@exactjs/react-compat';
type PipeApi = Pick<typeof import('@exactjs/react-dom-compat/server'), 'renderToPipeableStream'> &
	Pick<typeof import('@exactjs/react-dom-compat/static19'), 'resumeToPipeableStream'>;
function check(value: boolean, message: string): void {
	if (!value) throw new Error('React pipeable settlement: ' + message);
}
async function drainMicrotasks(): Promise<void> {
	for (let i = 0; i < 20; i++) await Promise.resolve();
}

/** Checks buffered failure, signal ownership and successful output for both Node stream facades. */
export async function verifyReactPipeableSettlement(api: PipeApi): Promise<void> {
	for (const render of [
		api.renderToPipeableStream,
		(node: ReactNode, options?: Parameters<typeof api.renderToPipeableStream>[1]) =>
			api.resumeToPipeableStream(node, null, options)
	]) {
		for (const late of [false, true]) {
			for (const failure of [undefined, null, new Error('child failed')]) {
				const stream = render(Promise.reject(failure) as unknown as ReactNode);
				if (late) await drainMicrotasks();
				const errors: Error[] = [];
				const destination = new Writable({
					write(_chunk, _encoding, done) {
						done();
					}
				});
				destination.on('error', (error) => errors.push(error));
				try {
					stream.pipe(destination);
					await new Promise<void>((resolve) => setTimeout(resolve, 0));
					check(
						destination.destroyed && errors.length === 1,
						'failed destination closes exactly once'
					);
					check(
						errors[0]?.message === (failure instanceof Error ? failure.message : String(failure)),
						'buffered failure retained'
					);
				} finally {
					destination.destroy();
				}
			}
		}
		const controller = new AbortController();
		controller.abort(new Error('caller cancelled'));
		const errors: unknown[] = [];
		render('value', {
			signal: controller.signal,
			onError: (error) => {
				errors.push(error);
			}
		});
		await drainMicrotasks();
		check(errors[0] === controller.signal.reason && errors.length === 1, 'caller signal retained');
		const output: string[] = [];
		const destination = new Writable({
			write(chunk, _encoding, done) {
				output.push(String(chunk));
				done();
			}
		});
		try {
			const finished = new Promise<void>((resolve, reject) => {
				destination.once('finish', resolve);
				destination.once('error', reject);
			});
			const stream = render('ready');
			stream.pipe(destination);
			await finished;
			check(output.join('') === 'ready', 'successful output');
			let rejected = false;
			try {
				stream.pipe(destination);
			} catch {
				rejected = true;
			}
			check(rejected, 'one destination per owner');
		} finally {
			destination.destroy();
		}
	}
}
