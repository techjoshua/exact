import { attachSuppressedCleanupFailure, type AnyComponentInstance } from '@exactjs/core';
import type { ExactComponentReceiptData } from '@exactjs/core/runtime/component-operations';
import { createEffectScope, type EffectScope } from '@exactjs/reactive/framework/runtime';
import type { Root } from '../types.js';
import { withTreeDepth, countDomWork } from './limits.js';
import { PreparedComponentAttachment } from './prepared-component-attachment.js';
import { mountNativeComponentArtifact } from './mounting/native-component-artifact.js';

/**
 * Constructs and executes one component without mounting its output. The caller must commit or
 * abort in the same synchronous transaction. Ordinary mounts do not allocate preparation records.
 */
export function prepareComponentReceipt(
	root: Root,
	receipt: ExactComponentReceiptData,
	parentInstance?: AnyComponentInstance,
	parentScope?: EffectScope,
	parentNode?: Node,
	mode: 'mount' | 'hydrate' = 'mount'
): PreparedComponentAttachment {
	const prepared = new PreparedComponentAttachment();
	try {
		withTreeDepth(root, () => {
			countDomWork(root);
			const scope = createEffectScope(parentScope);
			try {
				mountNativeComponentArtifact(
					root,
					receipt,
					scope,
					parentInstance,
					parentNode,
					prepared,
					mode
				);
			} catch (error) {
				try {
					scope.stop();
				} catch (cleanup) {
					attachSuppressedCleanupFailure(error, cleanup);
				}
				throw error;
			}
		});
		return prepared;
	} catch (error) {
		try {
			prepared.abort();
		} catch (cleanup) {
			attachSuppressedCleanupFailure(error, cleanup);
		}
		throw error;
	}
}
