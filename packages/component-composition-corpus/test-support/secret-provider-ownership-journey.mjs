import { writeFile } from 'node:fs/promises';
import path from 'node:path';

/** Checks dictionary names, ordinary provider values and exact file-load cancellation on filesystem hosts. */
export async function verifyEnvironmentProviderOwnership(
	{ environmentSecrets, createSecretResolver, createSecretsServerExtension },
	root
) {
	const check = (value, message) => {
		if (!value) throw new Error('Secret provider: ' + message);
	};
	await writeFile(
		path.join(root, '.env'),
		'TOKEN=ready\nEMPTY=\n__proto__=prototype-value\nconstructor=constructor-value\n'
	);
	const provider = environmentSecrets({ includeProcessEnvironment: false });
	const context = {
		applicationRoot: root,
		environment: 'test',
		signal: new AbortController().signal
	};
	const loaded = await provider.load(context);
	check(
		Object.hasOwn(loaded, '__proto__') &&
			loaded.__proto__ === 'prototype-value' &&
			loaded.constructor === 'constructor-value',
		'all valid environment names retained'
	);
	loaded.TOKEN = 'changed';
	const original = provider.load;
	let calls = 0;
	provider.load = (...args) => {
		calls++;
		return Reflect.apply(original, provider, args);
	};
	provider.name = 'observed-environment';
	const next = await provider.load(context);
	check(
		calls === 1 && next.TOKEN === 'ready' && loaded.TOKEN === 'changed',
		'ordinary provider and result aliases, independent next load'
	);
	const resolver = createSecretResolver(
		{ providers: [provider], required: ['__proto__', 'EMPTY'], allowPackages: [] },
		context
	);
	try {
		const extension = createSecretsServerExtension(resolver);
		const validate = extension.validate;
		extension.validate = (...args) => Reflect.apply(validate, extension, args);
		await extension.validate();
		check(
			resolver.require('__proto__') === 'prototype-value' && resolver.require('EMPTY') === '',
			'resolver retains special names and empty values'
		);
	} finally {
		await resolver.dispose();
	}
	for (const reason of [null, false, 0, 'owner-disposed']) {
		const owner = new AbortController();
		const mutable = { ...context, signal: owner.signal };
		const held = environmentSecrets({
			includeProcessEnvironment: false,
			files: ['missing-cancellation.env']
		});
		let resolved = false,
			failure;
		const pending = held.load(mutable).then(
			() => {
				resolved = true;
			},
			(error) => {
				failure = error;
			}
		);
		owner.abort(reason);
		mutable.signal = new AbortController().signal;
		await pending;
		check(
			!resolved && failure === reason,
			'file cancellation retains its captured owner and exact reason'
		);
	}
	return true;
}

/** Checks inherited provider context metadata and ownership of one initialization's source signal. */
export async function verifySecretContextOwnership({ createSecretResolver }) {
	const check = (value, message) => {
		if (!value) throw new Error('Secret context: ' + message);
	};
	let rootReads = 0;
	const context = Object.create({
		get applicationRoot() {
			check(this === context, 'metadata getter receiver');
			rootReads++;
			return '/application';
		},
		environment: 'test',
		signal: new AbortController().signal
	});
	const seen = [];
	const resolver = createSecretResolver(
		{
			providers: [
				{
					name: 'first',
					async load(value) {
						seen.push(value);
						value.applicationRoot = '/changed';
						return {};
					}
				},
				{
					name: 'second',
					async load(value) {
						seen.push(value);
						return {};
					}
				}
			],
			required: [],
			allowPackages: []
		},
		context
	);
	try {
		await resolver.initialize();
		check(
			rootReads === 1 &&
				seen[1].applicationRoot === '/application' &&
				seen[1].environment === 'test',
			'inherited metadata captured once and provider contexts independent'
		);
	} finally {
		await resolver.dispose();
	}
	const queuedOwner = new AbortController();
	const queuedContext = {
		applicationRoot: '/application',
		environment: 'test',
		signal: queuedOwner.signal
	};
	let queuedCalls = 0;
	const queued = createSecretResolver(
		{
			providers: [
				{
					name: 'queued',
					async load() {
						queuedCalls++;
						return {};
					}
				}
			],
			required: [],
			allowPackages: []
		},
		queuedContext
	);
	try {
		const outcome = queued.initialize().then(
			() => ({ ok: true }),
			(reason) => ({ ok: false, reason })
		);
		queuedContext.signal = new AbortController().signal;
		queuedOwner.abort(null);
		const result = await outcome;
		check(
			!result.ok && result.reason === null && queuedCalls === 0,
			'queued initialization retains its source signal before provider selection'
		);
	} finally {
		await queued.dispose();
	}
	const getterFailure = { source: 'signal getter' };
	const failing = createSecretResolver(
		{ providers: [], required: [], allowPackages: [] },
		Object.create({
			get signal() {
				throw getterFailure;
			}
		})
	);
	try {
		const first = failing.initialize();
		check(
			first === failing.initialize(),
			'failed overlapping initialization retains shared promise'
		);
		const result = await first.then(
			() => ({ ok: true }),
			(reason) => ({ ok: false, reason })
		);
		check(
			!result.ok && result.reason === getterFailure,
			'signal getter failure remains an asynchronous original failure'
		);
	} finally {
		await failing.dispose();
	}
	for (const cancel of [false, true]) {
		const owner = new AbortController();
		const source = { applicationRoot: '/application', environment: 'test', signal: owner.signal };
		let release, started, providerSignal;
		const ready = new Promise((resolve) => {
			started = resolve;
		});
		const gate = new Promise((resolve) => {
			release = resolve;
		});
		const scoped = createSecretResolver(
			{
				providers: [
					{
						name: 'held',
						async load(value) {
							providerSignal = value.signal;
							value.signal.addEventListener('abort', () => release(), { once: true });
							started();
							await gate;
							return {};
						}
					}
				],
				required: [],
				allowPackages: []
			},
			source
		);
		try {
			const pending = scoped.initialize();
			const outcome = pending.then(
				() => ({ ok: true }),
				(reason) => ({ ok: false, reason })
			);
			await ready;
			source.signal = new AbortController().signal;
			if (cancel) owner.abort(null);
			else release();
			const result = await outcome;
			if (cancel)
				check(
					!result.ok && result.reason === null,
					'in-flight initialization retains original abort reason'
				);
			else {
				check(result.ok, 'held provider completes');
				owner.abort('after-completion');
				check(
					!providerSignal.aborted,
					'completed initialization detaches its original source signal'
				);
			}
		} finally {
			release();
			await scoped.dispose();
		}
	}
	return true;
}
