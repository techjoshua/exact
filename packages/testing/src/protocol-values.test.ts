import { it } from 'vitest';
import { ExactProtocolRecorder, type ExactProtocolExchange } from './protocol.js';
import { verifyRecorderObservationValues } from '../../component-composition-corpus/test-support/observation-values-journey.mjs';
it('keeps recorded metadata ordinary and independent of transport inputs', () =>
	verifyRecorderObservationValues({ ExactProtocolRecorder }));
/** Compile-only control for recorded request metadata. */
function readonlyHeaders(exchange: ExactProtocolExchange) {
	// @ts-expect-error Recorded headers remain readonly in TypeScript.
	exchange.headers.example = 'changed';
}
void readonlyHeaders;
