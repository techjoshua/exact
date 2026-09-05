import process from 'node:process';

/**
 * Owns cleanup for one long-lived development process.
 *
 * Signal handlers cover normal terminal interruption. The parent monitor covers Windows terminal
 * hosts which terminate npm or its command shell without forwarding a console signal to the
 * surviving server process.
 */
export function installDevelopmentProcessLifecycle({
	label,
	close,
	parentPid = process.ppid,
	parentPollMilliseconds = 250,
	processHost = process,
	processExists = operatingSystemProcessExists,
	setIntervalHost = setInterval,
	clearIntervalHost = clearInterval,
	exit = (code) => processHost.exit(code)
}) {
	if (!label) throw new TypeError('A development process lifecycle requires a label');
	if (typeof close !== 'function')
		throw new TypeError('A development process lifecycle requires close()');
	if (!Number.isInteger(parentPid) || parentPid < 1)
		throw new TypeError(`Invalid development process parent PID ${JSON.stringify(parentPid)}`);

	let closing;
	let disposed = false;
	const handlers = new Map();
	const monitor = setIntervalHost(() => {
		if (!processExists(parentPid)) void shutdown('parent-exited');
	}, parentPollMilliseconds);

	for (const signal of lifecycleSignals(processHost.platform)) {
		const handler = () => void shutdown(signal);
		handlers.set(signal, handler);
		processHost.once(signal, handler);
	}

	/** Releases monitoring without closing a process that already ended by itself. */
	function dispose() {
		if (disposed) return;
		disposed = true;
		clearIntervalHost(monitor);
		for (const [signal, handler] of handlers) processHost.off(signal, handler);
		handlers.clear();
	}

	/** Runs cleanup exactly once and exits only after owned resources settle. */
	function shutdown(reason, exitCode = 0) {
		return (closing ??= (async () => {
			dispose();
			try {
				await close(reason);
				exit(exitCode);
			} catch (error) {
				processHost.stderr.write(
					`Failed to close ${label} after ${reason}: ${error instanceof Error ? error.stack : String(error)}\n`
				);
				exit(1);
			}
		})());
	}

	return Object.freeze({ dispose, shutdown });
}

/** Reports whether an operating-system process still owns its PID. */
export function operatingSystemProcessExists(processId) {
	try {
		process.kill(processId, 0);
		return true;
	} catch (error) {
		return error?.code === 'EPERM';
	}
}

/** Selects only signals supported by the current Node platform. */
function lifecycleSignals(platform) {
	return platform === 'win32'
		? ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK']
		: ['SIGINT', 'SIGTERM', 'SIGHUP'];
}
