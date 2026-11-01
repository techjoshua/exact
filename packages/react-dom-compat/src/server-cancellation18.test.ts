import { it } from 'vitest';
import * as api from '@exactjs/react-compat/react18';
import { renderToString, renderToReadableStream } from './server/shared.js';
import { verifyReactServerCancellation } from '../../component-composition-corpus/test-support/react-server-cancellation-journey.js';
it('preserves server cancellation reasons and settles pending children', () =>
	verifyReactServerCancellation({ ...api, renderToString, renderToReadableStream }));
