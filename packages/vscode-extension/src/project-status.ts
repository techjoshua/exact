import type { ExactProjectStatusResult } from '@exactjs/language-server';

/** Text and diagnostic detail shown by the VS Code status-bar contribution. */
export type ExactProjectStatusPresentation = Readonly<{ text: string; tooltip: string }>;

/** Projects compiler and language-provider health without depending on VS Code runtime objects. */
export function projectStatusPresentation(
	status: ExactProjectStatusResult
): ExactProjectStatusPresentation {
	if (!status.trusted)
		return Object.freeze({
			text: '$(shield) eXact restricted',
			tooltip: 'Compiler execution disabled until this workspace is trusted.'
		});
	const providers = status.providers ?? [];
	const unhealthy = providers.some(
		(provider) => provider.health === 'failed' || provider.health === 'quarantined'
	);
	const text = `${status.providerFailure || unhealthy ? '$(warning)' : '$(symbol-namespace)'} eXact ${status.project?.kind ?? 'project'}`;
	const compiler = status.compiler
		? `TypeScript ${status.compiler.typescriptVersion}; eXact backend ${status.compiler.backendVersion}`
		: 'Compiler project is initializing.';
	const providerLines = providers.length
		? providers.map(
				(provider) =>
					`${providerHealthLabel(provider.health)} ${provider.id} ${provider.health}${provider.message ? `: ${provider.message}` : ''}`
			)
		: ['Language providers: none active for this file.'];
	return Object.freeze({
		text,
		tooltip: [
			compiler,
			...(status.project?.root ? [`Project root: ${status.project.root}`] : []),
			...(providers.length ? ['Language providers:', ...providerLines] : providerLines),
			...(status.providerFailure ? [`Provider host failure: ${status.providerFailure}`] : [])
		].join('\n')
	});
}

function providerHealthLabel(
	health: NonNullable<ExactProjectStatusResult['providers']>[number]['health']
): string {
	switch (health) {
		case 'ready':
			return '✓';
		case 'failed':
			return '✗';
		case 'quarantined':
			return '!';
		case 'idle':
			return '○';
	}
}
