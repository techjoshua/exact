import { TaskContext, type Component } from '@exactjs/core';
import { consume, type Secret } from '@exactjs/secrets';

let configuredCredential = '' as Secret<string>;

/** Retains declared secret receipt through native computed forwarding for explicit server consumption by its caller. */
function preserveCredential(credential: Secret<string>): Secret<string> {
	return credential;
}

async function requestPublicLabel(credential: string): Promise<string> {
	if (!credential) throw new Error('Missing credential');
	await Promise.resolve();
	return 'Authorized public result';
}

/** @exact server */
function PrivateCredentialPage(this: Component<{ credential: Secret<string>; label: string }>) {
	this.state.credential = configuredCredential;
	this.state.label = 'Waiting for public result';
	const load = async (_task: TaskContext = TaskContext.server().blocking()) => {
		void _task;
		this.state.label = await requestPublicLabel(
			consume(preserveCredential['call'](undefined, this.state.credential))
		);
	};
	load();
	return () => <output>{this.state.label}</output>;
}

/** Supplies a server-owned credential and renders only the explicitly public service result. */
export function secretContainmentRoot(credential: Secret<string>) {
	configuredCredential = credential;
	return <PrivateCredentialPage />;
}
