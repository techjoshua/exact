import type { AnalysisJob, Incident, InitialData } from '../contracts.js';
import {
	claimIncident,
	refreshIncidentData,
	requestAnalysis,
	serviceUrl,
	submitComment
} from '../service-client.js';

/** Owns Nuxt/Vue reactive application state, optimistic work, and browser lifecycle resources. */
export function useIncidentWorkspace(initial: InitialData, initialPath: string) {
	const incidents = ref(initial.incidents);
	const users = ref(initial.users);
	const sessionUserId = ref(initial.sessionUserId);
	const selectedId = ref(pathIncident(initialPath) || incidents.value[0]?.id || '');
	const viewVersion = ref(
		incidents.value.find((item) => item.id === selectedId.value)?.version ?? 0
	);
	const severity = ref('all');
	const status = ref('all');
	const loading = ref(false);
	const error = ref('');
	const detailError = ref('');
	const conflict = ref('');
	const draft = ref('');
	const job = ref<AnalysisJob | null>(null);
	const busy = ref(false);
	const connection = ref('Connecting');
	const filtered = computed(() =>
		incidents.value.filter(
			(item) =>
				(severity.value === 'all' || item.severity === severity.value) &&
				(status.value === 'all' || item.status === status.value)
		)
	);
	const selected = computed(() => incidents.value.find((item) => item.id === selectedId.value));
	const ownerName = computed(
		() => users.value.find((user) => user.id === selected.value?.ownerId)?.name ?? 'Unassigned'
	);
	const replaceIncident = (incident: Incident) => {
		incidents.value = incidents.value.map((item) => (item.id === incident.id ? incident : item));
	};
	const selectIncident = (id: string) => {
		selectedId.value = id;
		viewVersion.value = incidents.value.find((item) => item.id === id)?.version ?? 0;
		history.pushState({}, '', `/incidents/${id}`);
	};
	const refresh = async () => {
		loading.value = true;
		error.value = '';
		try {
			const result = await refreshIncidentData();
			incidents.value = result.incidents;
			users.value = result.users;
			sessionUserId.value = result.sessionUserId;
		} catch {
			error.value = 'Service unavailable';
		} finally {
			loading.value = false;
		}
	};
	const claim = async () => {
		if (!selected.value) return;
		const original = copyIncident(selected.value);
		replaceIncident({ ...original, ownerId: sessionUserId.value, status: 'investigating' });
		detailError.value = '';
		conflict.value = '';
		try {
			const { response, payload } = await claimIncident(
				original.id,
				sessionUserId.value,
				viewVersion.value
			);
			if (response.status === 409 && payload.error?.current) {
				replaceIncident(payload.error.current);
				viewVersion.value = payload.error.current.version;
				conflict.value =
					'This incident changed while you were viewing it. The latest owner is shown.';
			} else if (!response.ok)
				throw new Error(payload.error?.message ?? 'Unable to claim incident');
			else {
				replaceIncident(payload.incident);
				viewVersion.value = payload.incident.version;
			}
		} catch (caught) {
			replaceIncident(original);
			detailError.value = caught instanceof Error ? caught.message : 'Unable to claim incident';
		}
	};
	const addComment = async () => {
		if (!selected.value) return;
		const body = draft.value.trim();
		if (!body || [...body].length > 2_000) {
			detailError.value = 'Comment must contain 1 to 2,000 characters.';
			return;
		}
		const original = copyIncident(selected.value);
		replaceIncident({
			...original,
			comments: [
				...original.comments,
				{
					id: `pending-${crypto.randomUUID()}`,
					authorId: sessionUserId.value,
					body,
					createdAt: new Date().toISOString()
				}
			]
		});
		draft.value = '';
		detailError.value = '';
		try {
			const { response, payload } = await submitComment(original.id, sessionUserId.value, body);
			if (!response.ok) throw new Error(payload.error?.message ?? 'Unable to add comment');
			replaceIncident(payload.incident);
			viewVersion.value = payload.incident.version;
		} catch (caught) {
			replaceIncident(original);
			draft.value = body;
			detailError.value = caught instanceof Error ? caught.message : 'Unable to add comment';
		}
	};
	const analyze = async () => {
		if (!selected.value) return;
		busy.value = true;
		detailError.value = '';
		try {
			const { response, payload } = await requestAnalysis(selected.value.id);
			if (!response.ok || !payload.job) throw new Error(payload.error?.message);
			job.value = payload.job;
		} catch (caught) {
			detailError.value = caught instanceof Error ? caught.message : 'Unable to start analysis';
		} finally {
			busy.value = false;
		}
	};

	let events: EventSource | undefined;
	let followLocation: (() => void) | undefined;
	onMounted(() => {
		events = new EventSource(`${serviceUrl}/api/events`);
		events.onopen = () => (connection.value = 'Live service');
		events.onerror = () => (connection.value = 'Reconnecting');
		events.addEventListener('incident', (event) =>
			replaceIncident(JSON.parse((event as MessageEvent<string>).data))
		);
		events.addEventListener('job', (event) => {
			const next = JSON.parse((event as MessageEvent<string>).data);
			if (next.id === job.value?.id) job.value = next;
		});
		followLocation = () => (selectedId.value = pathIncident(location.pathname));
		window.addEventListener('popstate', followLocation);
	});
	onBeforeUnmount(() => {
		events?.close();
		if (followLocation) window.removeEventListener('popstate', followLocation);
	});
	return {
		incidents,
		users,
		selectedId,
		severity,
		status,
		loading,
		error,
		detailError,
		conflict,
		draft,
		job,
		busy,
		connection,
		filtered,
		selected,
		ownerName,
		selectIncident,
		refresh,
		claim,
		addComment,
		analyze
	};
}

function pathIncident(path: string) {
	return path.match(/^\/incidents\/([^/]+)$/)?.[1] ?? '';
}

function copyIncident(incident: Incident): Incident {
	return { ...incident, comments: incident.comments.map((comment) => ({ ...comment })) };
}
