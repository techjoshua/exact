import { createMountedScope } from './component-mount-ownership.js';
import { type AdmittedClientComponentInput } from './component-input-admission.js';
import { attachSuppressedCleanupFailure, type AnyComponentInstance } from '@exactjs/core';
import { type EffectScope } from '@exactjs/reactive/framework/runtime';
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
	receipt: AdmittedClientComponentInput,
	parentInstance?: AnyComponentInstance,
	parentScope?: EffectScope,
	parentNode?: Node,
	mode: 'mount' | 'hydrate' = 'mount'
): PreparedComponentAttachment {
	const prepared = new PreparedComponentAttachment(root);
	try {
		withTreeDepth(root, () => {
			countDomWork(root);
			const scope = createMountedScope(parentScope);
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
