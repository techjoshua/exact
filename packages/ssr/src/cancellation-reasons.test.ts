import { it } from 'vitest';
import { renderToStream, renderToProgressiveHtmlStream, renderToDocumentStream } from './index.js';
import { verifySsrCancellationReasons } from '../../component-composition-corpus/test-support/ssr-cancellation-reasons-journey.js';
it('preserves native stream cancellation reasons and successful completion', () =>
	verifySsrCancellationReasons({
		renderToStream,
		renderToProgressiveHtmlStream,
		renderToDocumentStream
	}));
