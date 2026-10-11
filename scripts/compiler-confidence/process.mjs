import { spawn } from 'node:child_process';

/** Runs finite coverage commands and forwards cancellation to the owned process tree before cleanup. */
export function run(command, args, cwd, env = process.env, capture = false) {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, {
			cwd,
			env,
			detached: process.platform !== 'win32',
			stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit'
		});
		let log = '';
		if (capture) {
			child.stdout.on('data', (chunk) => {
				log += chunk;
			});
			child.stderr.on('data', (chunk) => {
				log += chunk;
			});
		}
		let interruption;
		const interrupt = (signal) => {
			interruption = signal;
			process.exitCode = signal === 'SIGINT' ? 130 : 143;
			if (!child.pid) return;
			if (process.platform === 'win32') {
				spawn('taskkill.exe', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore' });
			} else {
				try {
					process.kill(-child.pid, signal);
				} catch (error) {
					if (error.code !== 'ESRCH') throw error;
				}
			}
		};
		const onInterrupt = () => interrupt('SIGINT');
		const onTerminate = () => interrupt('SIGTERM');
		process.on('SIGINT', onInterrupt);
		process.on('SIGTERM', onTerminate);
		child.once('close', () => {
			process.off('SIGINT', onInterrupt);
			process.off('SIGTERM', onTerminate);
		});
		child.once('error', reject);
		child.once('close', (code, signal) =>
			code === 0 && !signal && !interruption
				? resolve(log)
				: reject(new Error(`${command} failed (${signal ?? interruption ?? code})\n${log}`))
		);
	});
}
