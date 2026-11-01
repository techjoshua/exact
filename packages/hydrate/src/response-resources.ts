import { logFrameworkEvent, type Logger } from '@exactjs/core';
import {
	createResponseResourceBudget,
	type ResponseResourceBudget
} from '@exactjs/core/framework/protocol-records';

/** Creates a response owner's resource policy using its existing framework logger. */
export function responseResourceBudget(logger?: Logger): ResponseResourceBudget {
	return createResponseResourceBudget((level, message, details) =>
		logFrameworkEvent(level, 'hydrate', 'response-resource', message, details, logger)
	);
}

/** Maps existing response settings to measured graph content without changing input policy. */
export function responseGraphLimits(
	limits: {
		maxJsonDepth?: number;
		maxJsonNodes?: number;
		maxBytes?: number;
		maxResponseBytes?: number;
	},
	resources: ResponseResourceBudget,
	scope: string,
	thresholds = { depth: 100, nodes: 100_000, bytes: 16 * 1024 * 1024 }
) {
	return {
		onResource(kind: 'depth' | 'nodes' | 'bytes', actual: number): void {
			const option =
				kind === 'depth' ? 'maxJsonDepth' : kind === 'nodes' ? 'maxJsonNodes' : 'maxBytes';
			const configured =
				kind === 'depth'
					? limits.maxJsonDepth
					: kind === 'nodes'
						? limits.maxJsonNodes
						: limits.maxBytes;
			resources(
				option,
				configured,
				thresholds[kind],
				actual,
				scope,
				kind === 'bytes'
					? 'UTF-8 graph-content bytes'
					: kind === 'nodes'
						? 'graph values/properties'
						: 'graph levels'
			);
		}
	};
}
