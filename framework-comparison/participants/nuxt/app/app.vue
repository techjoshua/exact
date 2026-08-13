<script setup lang="ts">
import { loadInitialData } from './service-client.js';

const route = useRoute();
const { data } = await useAsyncData('incident-initial-data', loadInitialData);
if (!data.value) throw new Error('Incident initial data was not available');
const {
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
} = useIncidentWorkspace(data.value, route.path);
</script>

<template>
	<div class="app-shell">
		<header class="masthead">
			<div>
				<span class="eyebrow">Operations workspace</span>
				<h1>Signal Desk</h1>
			</div>
			<span class="connection" role="status">{{ connection }}</span>
		</header>
		<main>
			<section class="queue-panel" aria-labelledby="queue-title">
				<div class="section-heading">
					<div>
						<span class="eyebrow">Active response</span>
						<h2 id="queue-title">Incident queue</h2>
					</div>
					<button class="quiet" @click="refresh">Refresh</button>
				</div>
				<div class="filters">
					<label
						>Severity<select v-model="severity">
							<option value="all">All</option>
							<option value="critical">Critical</option>
							<option value="high">High</option>
							<option value="medium">Medium</option>
						</select></label
					>
					<label
						>Status<select v-model="status">
							<option value="all">All</option>
							<option value="open">Open</option>
							<option value="investigating">Investigating</option>
							<option value="closed">Closed</option>
						</select></label
					>
				</div>
				<p v-if="loading" class="empty">Loading incidents…</p>
				<p v-if="!loading && incidents.length === 0 && !error" class="empty">
					No incidents match this workspace.
				</p>
				<p v-if="error" role="alert">{{ error }}</p>
				<div class="incident-list">
					<button
						v-for="incident in filtered"
						:key="incident.id"
						class="incident"
						:class="{ active: incident.id === selectedId }"
						data-testid="incident-row"
						@click="selectIncident(incident.id)"
					>
						<span class="severity" :class="incident.severity">{{ incident.severity }}</span
						><strong>{{ incident.title }}</strong
						><small
							>{{ incident.ownerId ? 'Assigned' : 'Unassigned' }} · {{ incident.status }}</small
						>
					</button>
				</div>
			</section>
			<section class="detail-panel" aria-label="Incident detail">
				<template v-if="selected">
					<div class="detail-heading">
						<div>
							<span class="severity" :class="selected.severity">{{ selected.severity }}</span>
							<h2>{{ selected.title }}</h2>
						</div>
						<span class="version">Version {{ selected.version }}</span>
					</div>
					<div class="facts">
						<div>
							<span>Owner</span><strong>{{ ownerName }}</strong>
						</div>
						<div>
							<span>Status</span><strong>{{ selected.status }}</strong>
						</div>
					</div>
					<p v-if="conflict" class="alert" role="alert">{{ conflict }}</p>
					<p v-if="detailError" class="alert" role="alert">{{ detailError }}</p>
					<button class="primary" @click="claim">Claim incident</button>
					<section class="analysis-card">
						<div>
							<h3>Server analysis</h3>
							<p role="status">{{ job ? `Analysis ${job.status}` : 'Analysis has not started' }}</p>
							<strong v-if="job?.result">{{ job.result.finding }}</strong>
						</div>
						<button class="quiet" :disabled="busy" @click="analyze">Start analysis</button>
					</section>
					<section class="comments">
						<h3>Response log</h3>
						<p v-if="selected.comments.length === 0" class="empty">No comments yet.</p>
						<article v-for="comment in selected.comments" :key="comment.id">
							<strong>{{ users.find((user) => user.id === comment.authorId)?.name }}</strong>
							<p>{{ comment.body }}</p>
						</article>
						<form @submit.prevent="addComment">
							<label
								>New comment<textarea v-model="draft" maxlength="2000" required></textarea></label
							><button class="primary" type="submit">Add comment</button>
						</form>
					</section>
				</template>
				<p v-else class="empty">Select an incident to inspect its response history.</p>
			</section>
		</main>
	</div>
</template>
