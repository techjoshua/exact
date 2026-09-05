import {
	exactComponentIdentity,
	readExactComponentContract
} from '@exactjs/core/framework/component-contracts';
import {
	composeExactExecutorContract,
	createExactHydrationConfig,
	defineExactOperationContract,
	handleExactRequest,
	type ExactRequestLike
} from '@exactjs/server';
import {
	createExactServerRuntime,
	renderToHydratableProgressiveHtmlResponse,
	renderToHydratableStringAsync
} from '@exactjs/ssr';
import { ProfilePage } from '../.exact/ProfilePage.exact.server.js';

const profileContract = readExactComponentContract(ProfilePage);
if (!profileContract) throw new Error('ProfilePage is missing its generated executor contract');
const profileBoundaryId = profileContract.boundaries[0]?.id;
if (!profileBoundaryId) throw new Error('ProfilePage is missing its generated client boundary');

/** Provides the executor authority reachable from this application root. */
export const exactContract = composeExactExecutorContract([ProfilePage], {
	endpoint: '/__exact',
	invocations: {
		'save-profile': defineExactOperationContract('save-profile', {
			componentId: exactComponentIdentity(ProfilePage),
			writes: [{ path: 'saved', kind: 'write', confidence: 'exact' }],
			boundaries: [profileBoundaryId]
		})
	}
});

/** Provides the canonical exact runtime value. */
export const exactRuntime = createExactServerRuntime({
	contract: exactContract,
	markers: false,
	patchStrategy: 'element',
	invocations: {
		'save-profile': () => ({ state: { saved: true } })
	},
	boundaries: {
		[profileBoundaryId]: () => <section className="saved">Saved on the server</section>
	}
});

/** Renders the profile page sample to hydratable HTML. */
export async function renderProfilePage(name: string) {
	return renderToHydratableStringAsync(<ProfilePage name={name} />, {
		markers: false,
		...createExactHydrationConfig(exactContract, { state: { profile: { name } } })
	});
}

/** Renders the profile page sample as a progressive hydratable response. */
export function renderProfilePageResponse(name: string) {
	return renderToHydratableProgressiveHtmlResponse(<ProfilePage name={name} />, {
		markers: false,
		rootId: 'app',
		...createExactHydrationConfig(exactContract, { state: { profile: { name } } })
	});
}

/** Handles server-component endpoint requests for the profile sample. */
export function handleExactServerRequest(request: ExactRequestLike) {
	return handleExactRequest(request, exactRuntime);
}
