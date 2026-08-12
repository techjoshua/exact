<script lang="ts">
	import { onMount } from 'svelte';
	import IncidentDetail from '$lib/IncidentDetail.svelte';
	import IncidentQueue from '$lib/IncidentQueue.svelte';
	import { subscribeLiveService } from '$lib/live-service.js';
	import { loadIncidentData } from '$lib/service-client.js';
	import type { Incident, InitialData, User } from '$lib/contracts.js';
	import './styles.css';

	let { data, children } = $props<{ data: InitialData; children: unknown }>();
	// The layout deliberately owns a mutable client snapshot; later route data must not replace live state.
	// svelte-ignore state_referenced_locally
	const initialData = $state.snapshot(data);
	let incidents = $state(initialData.incidents);
	let users = $state<User[]>(initialData.users);
	let sessionUserId = $state(initialData.sessionUserId);
	let selectedId = $state(pathIncident(initialData.path) || initialData.incidents[0]?.id || '');
	let loading = $state(false);
	let error = $state('');
	let connection = $state('Connecting');
	let selected = $derived(incidents.find((incident: Incident) => incident.id === selectedId));

	function replaceIncident(
		incident: Incident,
		mode: 'optimistic' | 'authoritative' = 'authoritative'
	) {
		incidents = incidents.map((current: Incident) =>
			current.id !== incident.id ||
			(mode === 'authoritative' &&
				(current.version > incident.version || sameIncidentResource(current, incident)))
				? current
				: incident
		);
	}
	/** Distinguishes a duplicate transport delivery from an equal-version optimistic projection. */
	function sameIncidentResource(left: Incident, right: Incident) {
		return (
			left.version === right.version &&
			left.ownerId === right.ownerId &&
			left.status === right.status &&
			left.comments.length === right.comments.length &&
			left.comments.every((comment, index) => {
				const candidate = right.comments[index];
				return (
					candidate?.id === comment.id &&
					candidate.authorId === comment.authorId &&
					candidate.body === comment.body &&
					candidate.createdAt === comment.createdAt
				);
			})
		);
	}
	function selectIncident(id: string) {
		selectedId = id;
		history.pushState({}, '', `/incidents/${id}`);
	}
	async function refresh() {
		loading = true;
		error = '';
		try {
			const result = await loadIncidentData();
			incidents = result.incidents;
			users = result.users;
			sessionUserId = result.sessionUserId;
		} catch (caught) {
			error = caught instanceof Error ? caught.message : 'Service unavailable';
		} finally {
			loading = false;
		}
	}
	onMount(() => {
		const releaseLiveService = subscribeLiveService({
			onConnection: (status) => (connection = status),
			onIncident: (incident) => replaceIncident(incident, 'authoritative')
		});
		const followLocation = () => (selectedId = pathIncident());
		window.addEventListener('popstate', followLocation);
		return () => {
			releaseLiveService();
			window.removeEventListener('popstate', followLocation);
		};
	});
	function pathIncident(path = typeof location === 'undefined' ? '/' : location.pathname) {
		return path.match(/^\/incidents\/([^/]+)$/)?.[1] ?? '';
	}
</script>

<svelte:head><title>Signal Desk · SvelteKit</title></svelte:head>
<div class="app-shell">
	<header class="masthead">
		<div>
			<span class="eyebrow">Operations workspace</span>
			<h1>Signal Desk</h1>
		</div>
		<span class="connection" role="status">{connection}</span>
	</header>
	<main>
		<IncidentQueue
			{incidents}
			{selectedId}
			onSelectedIdChanged={selectIncident}
			{loading}
			{error}
			onRefresh={refresh}
		/>
		{#key selected?.id}
			<IncidentDetail incident={selected} {users} {sessionUserId} onIncident={replaceIncident} />
		{/key}
	</main>
</div>
{@render children()}
