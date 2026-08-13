<script lang="ts">
	import type { Incident } from './contracts.js';

	let { incidents, selectedId, onSelectedIdChanged, loading, error, onRefresh } = $props<{
		incidents: Incident[];
		selectedId: string;
		onSelectedIdChanged(id: string): void;
		loading: boolean;
		error: string;
		onRefresh(): void;
	}>();
	let severity = $state('all');
	let status = $state('all');
	let filtered = $derived(
		incidents.filter(
			(item: Incident) =>
				(severity === 'all' || item.severity === severity) &&
				(status === 'all' || item.status === status)
		)
	);
</script>

<section class="queue-panel" aria-labelledby="queue-title">
	<div class="section-heading">
		<div>
			<span class="eyebrow">Active response</span>
			<h2 id="queue-title">Incident queue</h2>
		</div>
		<button class="quiet" onclick={onRefresh}>Refresh</button>
	</div>
	<div class="filters">
		<label
			>Severity<select bind:value={severity}
				><option value="all">All</option><option value="critical">Critical</option><option
					value="high">High</option
				><option value="medium">Medium</option></select
			></label
		>
		<label
			>Status<select bind:value={status}
				><option value="all">All</option><option value="open">Open</option><option
					value="investigating">Investigating</option
				><option value="closed">Closed</option></select
			></label
		>
	</div>
	{#if loading}<p class="empty">Loading incidents…</p>{/if}
	{#if !loading && incidents.length === 0 && !error}<p class="empty">
			No incidents match this workspace.
		</p>{/if}
	{#if error}<p role="alert">{error}</p>{/if}
	<div class="incident-list">
		{#each filtered as incident (incident.id)}
			<button
				class:active={incident.id === selectedId}
				class="incident"
				onclick={() => onSelectedIdChanged(incident.id)}
				data-testid="incident-row"
			>
				<span class="severity {incident.severity}">{incident.severity}</span><strong
					>{incident.title}</strong
				><small>{incident.ownerId ? 'Assigned' : 'Unassigned'} · {incident.status}</small>
			</button>
		{/each}
	</div>
</section>
