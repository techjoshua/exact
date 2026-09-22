import type { ChildProcess } from 'node:child_process';

/** Owns a child until exit, including termination escalation after an unresponsive shutdown. */
export function ownChildProcess(child: ChildProcess): { stop(): Promise<void> } {
	let exited = child.exitCode !== null || child.signalCode !== null;
	let complete!: () => void;
	const exit = new Promise<void>((resolve) => {
		complete = resolve;
	});
	const onExit = () => {
		exited = true;
		child.off('exit', onExit);
		child.off('error', onError);
		complete();
	};
	const onError = () => {
		if (!child.pid) onExit();
	};
	if (exited) complete();
	else {
		child.once('exit', onExit);
		child.on('error', onError);
	}
	let stopping: Promise<void> | undefined;
	return {
		stop() {
			if (stopping) return stopping;
			stopping = exited
				? Promise.resolve()
				: new Promise<void>((resolve, reject) => {
						const cleanup = () => {
							clearTimeout(escalation);
							clearTimeout(deadline);
						};
						void exit.then(() => {
							cleanup();
							resolve();
						});
						const kill = (signal: NodeJS.Signals) => {
							if (exited) return;
							try {
								child.kill(signal);
							} catch (error) {
								cleanup();
								reject(error);
							}
						};
						const escalation = setTimeout(() => kill('SIGKILL'), 250);
						const deadline = setTimeout(() => {
							cleanup();
							reject(new Error('Child process did not exit after termination'));
						}, 5_000);
						kill('SIGTERM');
					});
			return stopping;
		}
	};
}
