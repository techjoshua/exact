<script lang="ts">
	import { onMount } from 'svelte';
	import { subscribeLiveService } from './live-service.js';
	import { claimIncident, requestAnalysis, submitComment } from './service-client.js';
	import type { AnalysisJob, Incident, User } from './contracts.js';

	let { incident, users, sessionUserId, onIncident } = $props<{
		incident?: Incident;
		users: User[];
		sessionUserId: string;
		onIncident(incident: Incident, mode?: 'optimistic' | 'authoritative'): void;
	}>();
	let draft = $state('');
	let conflict = $state('');
	let error = $state('');
	let job = $state<AnalysisJob | null>(null);
	let busy = $state(false);
	// The keyed detail instance intentionally fences mutations to the version first presented to it.
	// svelte-ignore state_referenced_locally
	const initialVersion = incident?.version ?? 0;
	let viewVersion = $state(initialVersion);
	let ownerName = $derived(
		users.find((user: User) => user.id === incident?.ownerId)?.name ?? 'Unassigned'
	);

	async function claim() {
		if (!incident) return;
		const original = copyIncident(incident);
		onIncident({ ...original, ownerId: sessionUserId, status: 'investigating' }, 'optimistic');
		conflict = '';
		error = '';
		try {
			const { response, payload } = await claimIncident(original.id, sessionUserId, viewVersion);
			if (response.status === 409 && payload.error?.current) {
				onIncident(payload.error.current, 'authoritative');
				viewVersion = payload.error.current.version;
				conflict = 'This incident changed while you were viewing it. The latest owner is shown.';
			} else if (!response.ok)
				throw new Error(payload.error?.message ?? 'Unable to claim incident');
			else {
				onIncident(payload.incident, 'authoritative');
				viewVersion = payload.incident.version;
			}
		} catch (caught) {
			onIncident(original, 'optimistic');
			error = caught instanceof Error ? caught.message : 'Unable to claim incident';
		}
	}
	async function addComment(event: SubmitEvent) {
		event.preventDefault();
		if (!incident) return;
		const body = draft.trim();
		if (!body || [...body].length > 2000) {
			error = 'Comment must contain 1 to 2,000 characters.';
			return;
		}
		const original = copyIncident(incident);
		onIncident(
			{
				...original,
				comments: [
					...original.comments,
					{
						id: `pending-${crypto.randomUUID()}`,
						authorId: sessionUserId,
						body,
						createdAt: new Date().toISOString()
					}
				]
			},
			'optimistic'
		);
		draft = '';
		error = '';
		try {
			const { response, payload } = await submitComment(original.id, sessionUserId, body);
			if (!response.ok) throw new Error(payload.error?.message ?? 'Unable to add comment');
			onIncident(payload.incident, 'authoritative');
			viewVersion = payload.incident.version;
		} catch (caught) {
			onIncident(original, 'optimistic');
			draft = body;
			error = caught instanceof Error ? caught.message : 'Unable to add comment';
		}
	}
	async function analyze() {
		if (!incident) return;
		busy = true;
		error = '';
		try {
			const { response, payload } = await requestAnalysis(incident.id);
			if (!response.ok || !payload.job) throw new Error(payload.error?.message);
			job = payload.job;
		} catch (caught) {
			error = caught instanceof Error ? caught.message : 'Unable to start analysis';
		} finally {
			busy = false;
		}
	}
	onMount(() => {
		return subscribeLiveService({
			onJob: (next) => {
				if (next.id === job?.id) job = next;
			}
		});
	});
	function copyIncident(value: Incident): Incident {
		return { ...value, comments: value.comments.map((comment) => ({ ...comment })) };
	}
</script>

<section class="detail-panel" aria-label="Incident detail">
	{#if incident}
		<div class="detail-heading">
			<div>
				<span class="severity {incident.severity}">{incident.severity}</span>
				<h2>{incident.title}</h2>
			</div>
			<span class="version">Version {incident.version}</span>
		</div>
		<div class="facts">
			<div><span>Owner</span><strong>{ownerName}</strong></div>
			<div><span>Status</span><strong>{incident.status}</strong></div>
		</div>
		{#if conflict}<p class="alert" role="alert">{conflict}</p>{/if}{#if error}<p
				class="alert"
				role="alert"
			>
				{error}
			</p>{/if}<button class="primary" onclick={claim}>Claim incident</button>
		<section class="analysis-card">
			<div>
				<h3>Server analysis</h3>
				<p role="status">{job ? `Analysis ${job.status}` : 'Analysis has not started'}</p>
				{#if job?.result}<strong>{job.result.finding}</strong>{/if}
			</div>
			<button class="quiet" disabled={busy} onclick={analyze}>Start analysis</button>
		</section>
		<section class="comments">
			<h3>Response log</h3>
			{#if incident.comments.length === 0}<p class="empty">
					No comments yet.
				</p>{/if}{#each incident.comments as comment (comment.id)}<article>
					<strong>{users.find((user: User) => user.id === comment.authorId)?.name}</strong>
					<p>{comment.body}</p>
				</article>{/each}
			<form onsubmit={addComment}>
				<label>New comment<textarea bind:value={draft} maxlength="2000" required></textarea></label
				><button class="primary" type="submit">Add comment</button>
			</form>
		</section>
	{:else}<p class="empty">Select an incident to inspect its response history.</p>{/if}
</section>
