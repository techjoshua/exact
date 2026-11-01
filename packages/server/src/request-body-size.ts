import { logFrameworkEvent, type Logger } from '@exactjs/core';
import { normalizeProtocolLimit } from '@exactjs/core/framework/protocol-records';

/** Warns about large request bodies when the application has not chosen a hard byte cap. */
export function reportDefaultRequestSize(bytes: number, maximum?: number, logger?: Logger): void {
	const threshold = 4 * 1024 * 1024;
	if (normalizeProtocolLimit(maximum, 0) || bytes <= threshold) return;
	logFrameworkEvent(
		'warn',
		'server',
		'request-size',
		'Request body exceeds 4 MiB. Set limits.maxRequestBytes to enforce an application-owned cap.',
		{ bytes, threshold },
		logger
	);
}
