import { readFile, writeFile } from 'node:fs/promises';
import { installDevelopmentProcessLifecycle } from '../../scripts/development-process-lifecycle.mjs';
import { startRustLoadProcess } from './rust-load-process-owner.mjs';

let driver;
const lifecycle = installDevelopmentProcessLifecycle({
	label: 'Rust SSR load',
	close: async () => {
		await driver?.close();
	}
});
try {
	const plan = JSON.parse(await readFile(process.argv[2], 'utf8'));
	driver = await startRustLoadProcess();
	driver.run(plan);
	const result = await driver.result;
	if (process.argv[3]) await writeFile(process.argv[3], JSON.stringify(result) + '\n');
	else console.log(JSON.stringify(result));
} catch (error) {
	console.error(error);
	process.exitCode = 1;
} finally {
	await driver?.close();
	lifecycle.dispose();
}
