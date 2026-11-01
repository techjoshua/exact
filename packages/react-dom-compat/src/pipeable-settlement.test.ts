import { it } from 'vitest';
import { renderToPipeableStream } from './server/node.js';
import { resumeToPipeableStream } from './static-node.js';
import { verifyReactPipeableSettlement } from '../../component-composition-corpus/test-support/react-pipeable-settlement-journey.js';
it('retains buffered stream settlement and caller cancellation', () =>
	verifyReactPipeableSettlement({ renderToPipeableStream, resumeToPipeableStream }));
