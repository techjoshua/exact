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
	return () =>
		!props.running ? (
			<time className="elapsed-clock">{formatElapsed(props.accumulatedSeconds)}</time>
		) : (
			<time className="elapsed-clock" key={props.startedAt} time:update="second">
				{formatElapsed(
					props.accumulatedSeconds + Math.max(0, Math.floor((Date.now() - props.startedAt) / 1_000))
				)}
			</time>
		);
}
