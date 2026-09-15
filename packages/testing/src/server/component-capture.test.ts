import { describe, expect, it } from 'vitest';
import { createServerComponentCapture } from './component-capture.js';

type Entry = Parameters<
	ReturnType<typeof createServerComponentCapture>['options']['onDirectComponentCreated']
>[0];

// Observation contracts provide only the component identity consumed by this unit.
function entry(host: Entry['host'], label: string): Entry {
	return {
		componentId: 'fixture',
		contract: { artifact: { instantiate: function Fixture() {} } } as Entry['contract'],
		host,
		state: { label },
		props: {}
	};
}

describe('server component capture', () => {
	it('discards abandoned descendants while preserving the settled parent and final child', () => {
		const capture = createServerComponentCapture();
		const parent = entry({}, 'Parent');
		capture.options.onDirectComponentCreated(parent);
		const checkpoint = capture.options.onComponentAttemptCheckpoint();
		const abandoned = entry({ parent: parent.host }, 'Abandoned');
		capture.options.onDirectComponentCreated(abandoned);
		capture.options.onDirectComponentRendered(abandoned);
		capture.options.onComponentAttemptRollback(checkpoint);
		const child = entry({ parent: parent.host }, 'Final');
		capture.options.onDirectComponentCreated(child);
		capture.options.onDirectComponentRendered(child);
		capture.options.onDirectComponentRendered(parent);
		const [root, retained] = capture.read();
		expect(capture.read().map((value) => value.state)).toEqual([
			{ label: 'Parent' },
			{ label: 'Final' }
		]);
		expect(retained?.parentId).toBe(root?.id);
		child.state.label = 'Disposed';
		expect(retained?.state).toEqual({ label: 'Final' });
	});
});
