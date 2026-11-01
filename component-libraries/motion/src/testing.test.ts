import { getEventListeners } from 'node:events';
import { expect, it } from 'vitest';
import { createMotionTestDriver } from './testing.js';

it.each(['finish', 'fail', 'finishAll', 'abort'] as const)(
	'releases the playback abort subscription after %s',
	async (settlement) => {
		const driver = createMotionTestDriver();
		const owner = new AbortController();
		const reason = { stopped: true };
		const result = driver.play({} as Element, { keyframes: [] }, owner.signal);
		const observed = result.catch((error) => error);
		expect(getEventListeners(owner.signal, 'abort')).toHaveLength(1);
		if (settlement === 'finishAll') driver.finishAll();
		else if (settlement === 'abort') owner.abort(reason);
		else if (settlement === 'fail') driver.playbacks[0]!.fail(reason);
		else driver.playbacks[0]!.finish();
		expect(await observed).toBe(
			settlement === 'fail' || settlement === 'abort' ? reason : undefined
		);
		expect(getEventListeners(owner.signal, 'abort')).toHaveLength(0);
		owner.abort('later');
		const next = driver.play({} as Element, { keyframes: [] }, new AbortController().signal);
		driver.finishAll();
		await expect(next).resolves.toBeUndefined();
	}
);
