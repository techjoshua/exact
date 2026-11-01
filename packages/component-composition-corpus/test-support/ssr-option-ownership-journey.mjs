/** Compares explicit and inherited SSR budgets across buffered and streaming public entries. */
export async function verifySsrOptionOwnership(api) {
	const check = (value, message) => {
		if (!value) throw new Error('SSR options: ' + message);
	};
	for (const maximum of [1, 4096]) {
		class Options {
			#maximum = maximum;
			get maxOutputBytes() {
				return this.#maximum;
			}
			get logger() {
				return { isEnabled: () => false, log() {} };
			}
		}
		for (const [mode, render] of [
			['string', api.renderToString],
			['hydration', api.renderToHydratableString],
			['html-stream', api.renderToStream],
			['document-stream', api.renderToDocumentStream],
			['progressive', api.renderToProgressiveHtmlStream]
		]) {
			for (const options of [
				new Options(),
				{ maxOutputBytes: maximum, logger: new Options().logger }
			]) {
				let result, failure;
				try {
					const rendered = await render(api.intrinsic('p', null, 'hello'), options);
					result =
						rendered instanceof ReadableStream
							? await new Response(rendered).text()
							: rendered.html;
				} catch (error) {
					failure = error;
				}
				if (maximum === 4096) {
					check(!failure && result.includes('<p>hello</p>'), mode + ' valid output');
				} else if (mode === 'document-stream') {
					const events = result
						.trim()
						.split('\n')
						.map((line) => JSON.parse(line));
					check(
						!failure &&
							events.some((event) => event.event === 'error') &&
							!events.some((event) => event.event === 'shell'),
						'document budget rejection'
					);
				} else if (mode === 'progressive') {
					check(
						!failure &&
							!result.includes('<p>hello</p>') &&
							result.includes('eXact document stream failed'),
						'progressive budget rejection'
					);
				} else check(failure?.name === 'SsrOutputLimitError', mode + ' output budget rejection');
			}
		}
	}
	const first = new AbortController(),
		second = new AbortController();
	let retained = 0;
	const add = first.signal.addEventListener,
		remove = first.signal.removeEventListener;
	first.signal.addEventListener = function (...args) {
		retained++;
		return Reflect.apply(add, this, args);
	};
	first.signal.removeEventListener = function (...args) {
		retained--;
		return Reflect.apply(remove, this, args);
	};
	try {
		const options = { signal: first.signal };
		const stream = api.renderToStream(api.intrinsic('p', null, 'complete'), options);
		options.signal = second.signal;
		check(
			(await new Response(stream).text()).includes('complete') && retained === 0,
			'completion releases the subscribed signal'
		);
	} finally {
		first.abort();
		second.abort();
	}
	const owner = new AbortController(),
		replacement = new AbortController();
	const options = { signal: owner.signal };
	const stream = api.renderToStream(api.intrinsic('p', null, 'cancel'), options);
	options.signal = replacement.signal;
	const reader = stream.getReader();
	try {
		const pending = reader.read();
		owner.abort(0);
		let rejected = false,
			reason;
		try {
			await pending;
		} catch (error) {
			rejected = true;
			reason = error;
		}
		check(
			rejected && reason === 0 && !replacement.signal.aborted,
			'original signal cancellation reason'
		);
	} finally {
		reader.releaseLock();
		owner.abort();
		replacement.abort();
	}
	let profileWritable = false;
	const observed = await api.renderToString(api.intrinsic('p', null, 'observed'), {
		onProfile(event) {
			profileWritable = Reflect.set(event, 'elapsedMs', 0);
		}
	});
	check(
		profileWritable && observed.html.includes('observed'),
		'profiling readonly follows TypeScript'
	);
	return true;
}

/** Checks that applications can render beyond diagnostic-size thresholds without choosing a cap. */
export async function verifySsrOutputPolicy(api) {
	const text = 'x'.repeat(17 * 1024 * 1024);
	for (const [mode, render] of [
		['string', api.renderToString],
		['hydration', api.renderToHydratableString],
		['html-stream', api.renderToStream],
		['document-stream', api.renderToDocumentStream],
		['progressive', api.renderToProgressiveHtmlStream]
	]) {
		const operation =
			mode === 'document-stream' || mode === 'progressive'
				? api.intrinsic(
						'html',
						null,
						api.intrinsic('head', null),
						api.intrinsic('body', null, text)
					)
				: text;
		const result = await render(operation, { logger: { isEnabled: () => false, log() {} } });
		if (!(result instanceof ReadableStream)) {
			if (result.html !== text) throw new Error('SSR output policy: incomplete ' + mode);
			continue;
		}
		const reader = result.getReader();
		let bytes = 0;
		try {
			for (;;) {
				const next = await reader.read();
				if (next.done) break;
				bytes += next.value.byteLength;
			}
			if (bytes < text.length) throw new Error('SSR output policy: incomplete ' + mode);
		} finally {
			await reader.cancel().catch(() => undefined);
			reader.releaseLock();
		}
	}
	return true;
}

/** Checks a broad finite tree against omitted and application-selected traversal quotas. */
export async function verifySsrTraversalPolicy(api) {
	const children = Array(10_000).fill('x');
	const operation = api.intrinsic(
		'main',
		null,
		...Array.from({ length: 11 }, () => api.intrinsic('section', null, ...children))
	);
	const expected =
		'<main>' + ('<section>' + 'x'.repeat(10_000) + '</section>').repeat(11) + '</main>';
	for (const options of [{}, { maxTreeNodes: 200_000 }]) {
		const result = await api.renderToString(operation, options);
		if (result.html !== expected) throw new Error('SSR traversal policy: incomplete finite output');
	}
	let rejected = false;
	try {
		await api.renderToString(operation, { maxTreeNodes: 1_000 });
	} catch (error) {
		rejected = error.name === 'SsrTreeNodeError';
	}
	if (!rejected) throw new Error('SSR traversal policy: explicit node cap was ignored');
	return true;
}
