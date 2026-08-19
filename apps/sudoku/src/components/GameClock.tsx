// The compiler consumes this namespace through the time:* enhancement syntax below.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import * as time from '@exactjs/time/enhancements' with { type: 'exact-enhancement' };
import { formatElapsed } from '../presentation.js';

type GameClockProps = {
	accumulatedSeconds: number;
	running: boolean;
	startedAt: number;
};

/** Formats an absolute elapsed-time anchor through the shared time scheduler. */
export function GameClock(props: GameClockProps) {
	return () => (
		<time className="elapsed-clock" time:update={props.running ? 'second' : 'disabled'}>
			{formatElapsed(
				props.running
					? props.accumulatedSeconds +
							Math.max(0, Math.floor((Date.now() - props.startedAt) / 1_000))
					: props.accumulatedSeconds
			)}
		</time>
	);
}
