import assert from 'node:assert/strict';

/** Applies the same observable SSR oracles to adapter and native runtime observations. */
export function assertComponentChildInputSsr(rows) {
	assert.deepEqual(
		rows.map((row) => row.case),
		['receiver', 'undefined', 'explicit', 'throw', 'occurrences']
	);
	const [receiver, absent, explicit, failure, occurrences] = rows;
	assert.equal(receiver.error, undefined);
	assert.equal(receiver.reads, 1 + receiver.otherReads);
	assert.ok(receiver.otherReads >= 2);
	assert.ok(receiver.events.every((event) => event.original));
	assert.match(receiver.html, /data-exact="true"/);
	assert.match(receiver.html, /<i[^>]*>first<\/i>/);
	assert.doesNotMatch(receiver.html, /<i[^>]*>later<\/i>/);
	assert.equal(absent.error, undefined);
	assert.equal(absent.reads, 1);
	assert.equal(explicit.error, undefined);
	assert.equal(explicit.reads, 0);
	assert.match(explicit.html, /<i[^>]*>first<\/i>/);
	assert.equal(failure.reads, 1);
	assert.equal(failure.sameError, true);
	assert.equal(occurrences.error, undefined);
	assert.equal(occurrences.reads, 2);
	assert.ok(occurrences.html.indexOf('>first</i>') < occurrences.html.indexOf('>later</i>'));
}
