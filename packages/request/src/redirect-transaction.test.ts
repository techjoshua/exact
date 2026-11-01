import { it } from 'vitest';
import { createRequestContextValue, commitRequestResponseState } from './index.js';
import { verifyRequestRedirectTransaction } from '../../component-composition-corpus/test-support/request-redirect-journey.js';
it.each(['http://[', '/bad\nlocation'])(
	'keeps redirect %s atomic across rejection and later response commit',
	(location) =>
		verifyRequestRedirectTransaction({ createRequestContextValue, commitRequestResponseState }, [
			location
		])
);
