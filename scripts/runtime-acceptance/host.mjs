import { spawn } from 'node:child_process';

/** Starts one native executable and always reaps it, including startup and assertion failures. */
export async function withNativeHost(executable, args, work) {
	const child = spawn(executable, args, { stdio: ['ignore', 'pipe', 'pipe'] });
	let output = '';
	let ready;
	let fail;
	const origin = new Promise((resolve, reject) => {
		ready = resolve;
		fail = reject;
	});
	const capture = (chunk) => {
		output = (output + chunk).slice(-65536);
		const match = output.match(/RUNTIME_READY (http:\/\/127\.0\.0\.1:\d+)/);
		if (match) ready(match[1]);
	};
	child.stdout.on('data', capture);
	child.stderr.on('data', capture);
	const exited = new Promise((resolve) => {
		child.once('exit', (code) => {
			fail(new Error(`Native host exited ${code}: ${output}`));
			resolve();
		});
		child.once('error', (error) => {
			fail(error);
			resolve();
		});
	});
	const deadline = setTimeout(
		() => fail(new Error(`Native host startup timed out: ${output}`)),
		30000
	);
	try {
		const url = await origin;
		clearTimeout(deadline);
		await work(url);
	} catch (error) {
		throw new Error(`Native acceptance failed: ${output}`, { cause: error });
	} finally {
		clearTimeout(deadline);
		if (child.exitCode === null) child.kill('SIGTERM');
		const kill = setTimeout(() => child.kill('SIGKILL'), 5000);
		try {
			await exited;
		} finally {
			clearTimeout(kill);
		}
	}
}
