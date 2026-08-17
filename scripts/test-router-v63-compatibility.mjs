import { spawnSync } from 'node:child_process';
import path from 'node:path';

const root = process.cwd();
const fixtureRelative = 'component-libraries/router/compatibility/react-router-v63';
const fixture = path.join(
	root,
	'component-libraries',
	'router',
	'compatibility',
	'react-router-v63'
);
runNpm(['ci', '--prefix', fixtureRelative, '--ignore-scripts']);
runNpm(['exec', 'vitest', 'run', 'component-libraries/router/src/historical-v63.test.ts'], {
	EXACT_REACT_ROUTER_V63_FIXTURE: fixture
});

function runNpm(args, environment = {}) {
	if (process.platform === 'win32')
		return run(process.env.ComSpec, ['/d', '/s', '/c', `npm ${args.join(' ')}`], environment);
	return run('npm', args, environment);
}

function run(command, args, environment = {}) {
	const result = spawnSync(command, args, {
		cwd: root,
		env: { ...process.env, ...environment },
		stdio: 'inherit'
	});
	if (result.status !== 0) process.exit(result.status ?? 1);
}
