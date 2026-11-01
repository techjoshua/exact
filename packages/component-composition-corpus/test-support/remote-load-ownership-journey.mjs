let sequence = 0;

/** Checks caller-owned remote waits without timers or rejection of other live callers. */
export async function verifyRemoteLoadOwnership({ load, component }) {
	const symbol = Symbol.for('@exactjs/microfrontends/remote-loader');
	const previous = globalThis[symbol];
	const records = [];
	const tasks = [];
	const check = (value, message) => {
		if (!value) throw new Error('Remote load ownership: ' + message);
	};
	const integrity = 'sha256-AAAA';
	const prefix = `https://remote.test/ownership-${++sequence}-`;
	const module = {
		buildKey: 'a'.repeat(40),
		root: 'ownership#./Panel',
		component,
		registration: {}
	};
	const start = (name, signal) => {
		const task = load(prefix + name + '.js', integrity, signal).then(
			(value) => ({ ok: true, value }),
			(error) => ({ ok: false, error })
		);
		tasks.push(task);
		return task;
	};
	// Deliberately permit late settlement after cancellation to exercise generation retirement.
	globalThis[symbol] = {
		load(url, _integrity, signal) {
			return new Promise((resolve, reject) => records.push({ url, signal, resolve, reject }));
		},
		publish() {}
	};
	try {
		const pre = new AbortController();
		pre.abort(null);
		const stopped = await start('pre-aborted', pre.signal);
		check(
			!stopped.ok && stopped.error === null && records.length === 0,
			'pre-aborted caller starts nothing'
		);

		const first = new AbortController();
		const second = new AbortController();
		const a = start('shared', first.signal);
		const b = start('shared', second.signal);
		check(records.length === 1, 'pending callers share work');
		first.abort(0);
		check(
			(await a).error === 0 && !records[0].signal.aborted,
			'one cancellation preserves another caller'
		);
		records[0].resolve(module);
		check((await b).value === module, 'remaining caller receives a validated module');

		const last = new AbortController();
		const cancelled = start('last', last.signal);
		const old = records.at(-1);
		last.abort(null);
		check(
			(await cancelled).error === null && old.signal.aborted,
			'last cancellation releases work with exact reason'
		);
		const replacement = start('last');
		const current = records.at(-1);
		check(current !== old, 'replacement starts a new generation');
		old.reject(new Error('late retired load'));
		await Promise.resolve();
		await Promise.resolve();
		const count = records.length;
		const joined = start('last');
		check(records.length === count, 'retired settlement cannot remove replacement');
		current.resolve(module);
		check(
			(await replacement).value === module && (await joined).value === module,
			'replacement and joining caller settle'
		);

		const mixedOwner = new AbortController();
		const bounded = start('mixed', mixedOwner.signal);
		const unbounded = start('mixed');
		const mixed = records.at(-1);
		mixedOwner.abort(false);
		check(
			(await bounded).error === false && !mixed.signal.aborted,
			'caller without signal retains shared work'
		);
		mixed.resolve(module);
		check((await unbounded).value === module, 'caller without signal completes');

		const offset = records.length;
		const owners = Array.from({ length: 65 }, () => new AbortController());
		const offered = owners.map((owner, index) => start('concurrent-' + index, owner.signal));
		check(
			records.length === offset + 65 &&
				records.slice(offset).every((record) => !record.signal.aborted),
			'65 live callers are not evicted'
		);
		owners.forEach((owner) => owner.abort(0));
		check(
			(await Promise.all(offered)).every((result) => !result.ok && result.error === 0),
			'all callers own cancellation'
		);
		check(
			records.slice(offset).every((record) => record.signal.aborted),
			'all last callers release their loads'
		);

		const invalid = start('validation');
		records.at(-1).resolve({ ...module, component() {} });
		check(!(await invalid).ok, 'uncompiled component remains rejected');
		const retried = start('validation');
		records.at(-1).resolve(module);
		check((await retried).value === module, 'validation failure permits a subsequent valid load');
		return { cases: 6 };
	} finally {
		for (const record of records) record.reject(new Error('Owned journey cleanup'));
		await Promise.all(tasks);
		await Promise.resolve();
		if (previous === undefined) delete globalThis[symbol];
		else globalThis[symbol] = previous;
	}
}
