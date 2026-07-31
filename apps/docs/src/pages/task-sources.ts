const inferredTaskSource = `function DraftEditor(this: Component<DraftState>) {
  this.state.draft = loadInitialDraft();

  function persistDraft(serialized: string) {
    localStorage.setItem('draft', serialized);
  }

  // The setup call activates the task now and whenever draft changes.
  persistDraft(JSON.stringify(this.state.draft));

  return () => <DraftForm value={this.state.draft} />;
}`;

const inferredLifetimeSource = `async function watchFeed(url: string) {
  const socket = new WebSocket(url);

  socket.addEventListener('message', receiveMessage);
  await new Promise<void>((resolve) => {
    socket.addEventListener('close', () => resolve(), { once: true });
  });
}

// No authored signal or cleanup is needed for these discoverable APIs.
watchFeed(this.state.feedUrl);`;

const reactiveTaskSource = `import { TaskContext } from '@exactjs/core';

function Search(this: Component<SearchState>) {
  this.state.query = '';
  this.state.results = [];

  async function search(
    query: string,
    task: TaskContext = TaskContext.client()
  ) {
    if (!query) {
      this.state.results = [];
      return;
    }
    const response = await fetch('/api/search?q=' + encodeURIComponent(query), {
      signal: task.signal
    });
    this.state.results = await response.json();
  }

  // Initialization plus reactive activation when query changes.
  search(this.state.query);

  return () => <SearchView results={this.state.results} />;
}`;

const capturedInputSource = `async function refreshRates(
  revision: number,
  draft: ShipmentDraft = this.state.draft,
  task: TaskContext = TaskContext.client()
) {
  await loadRates(revision, draft, task.signal);
}

// revision is tracked; draft is sampled for each resulting generation.
refreshRates(this.state.revision);`;

const schedulingSource = `async function saveDocument(
  documentId: string,
  document: Document,
  task: TaskContext = TaskContext.server()
    .queue()
    .key(documentId)
    .immediate()
) {
  await documents.save(documentId, document, task.signal);
}

return () => (
  <>
    <button onClick={() => saveDocument(this.state.id, this.state.document)}>
      Save current document
    </button>
    <p>
      {saveDocument.pendingCount > 0
        ? 'Saving ' + saveDocument.pendingCount + ' document(s)\u2026'
        : 'No saves pending'}
    </p>
  </>
);`;

const keyedStatusSource = `import { taskStatus } from '@exactjs/core';

// Create a status view during setup for a durable lane key.
const invoiceSave = taskStatus(saveDocument, { key: 'invoice' });

return () => (
  <button
    disabled={invoiceSave.pending}
    onClick={() => saveDocument('invoice', this.state.invoice)}
  >
    {invoiceSave.pending ? 'Saving invoice\u2026' : 'Save invoice'}
  </button>
);`;

const readinessSource = `function CheckoutData(this: Component<CheckoutState>) {
  async function loadCheckout(
    task: TaskContext = TaskContext.server().blocking()
  ) {
    this.state.checkout = await checkoutRepository.load(task.signal);
  }

  async function warmRecommendations(
    task: TaskContext = TaskContext.server().deferred().nonblocking()
  ) {
    this.state.recommendations = await recommendations.load(task.signal);
  }

  loadCheckout();
  warmRecommendations();
  return () => <CheckoutView state={this.state} />;
}

function Checkout(this: Component<{}>) {
  return () => (
    <Suspense fallback={<CheckoutSkeleton />}>
      <CheckoutData />
    </Suspense>
  );
}`;

const invokedTaskSource = `async function save(
  profile: Profile,
  task: TaskContext = TaskContext.server().latest().immediate()
) {
  task.optimistic(() => {
    this.state.profile = profile;
  });
  this.state.profile = await repository.save(profile, task.signal);
}

return () => (
  <button disabled={save.pending} onClick={() => save(this.state.profile)}>
    {save.pending ? 'Saving\u2026' : 'Save'}
  </button>
);`;

const effectsAndResultsSource = `async function refreshIndex(
  task: TaskContext = TaskContext.client()
) {
  const entries = await fetchIndex(task.signal);
  this.state.entries = entries; // effect published by this generation
  return entries.length;        // result exposed to the caller
}

async function synchronize() {
  const count = await refreshIndex(); // observe and sequence the result

  void refreshBadges();               // effects still run and stay attached
  void refreshAudit().catch(report);  // observe and recover its result edge

  this.state.lastCount = count;
}`;

const ownedResourcesSource = `async function watch(
  url: string,
  task: TaskContext = TaskContext.client()
) {
  const socket = task.own(new ManagedSocket(url));
  const unsubscribe = socket.subscribe(receiveMessage);
  task.cleanup(unsubscribe);
  return socket.ready;
}`;

const librarySource = `import {
  createTaskOwner,
  defineTask,
  bindTask
} from '@exactjs/core/tasks/v1';

const owner = createTaskOwner({ label: 'catalog session' });
const search = bindTask(
  defineTask(
    { concurrency: 'latest', priority: 'deferred' },
    async (query: string, task) => catalog.search(query, task.signal)
  ),
  { owner }
);

const results = await search(query);
await owner[Symbol.asyncDispose]();`;

/** Code samples rendered by the task guide, grouped away from its article structure. */
export const taskSources = Object.freeze({
	capturedInputSource,
	effectsAndResultsSource,
	inferredLifetimeSource,
	inferredTaskSource,
	invokedTaskSource,
	keyedStatusSource,
	librarySource,
	ownedResourcesSource,
	reactiveTaskSource,
	readinessSource,
	schedulingSource
});
