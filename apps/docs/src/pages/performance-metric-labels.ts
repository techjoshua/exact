/** Reader-facing labels for captured metrics; recorded names and numerical data remain unchanged. */
export function performanceMetricTitle(title: string): string {
	if (title === 'Navigation completion') return 'Browser load event';
	if (title === 'First contentful paint') return 'Time until the first content appears';
	if (title === 'Optimistic feedback') return 'Time until the click receives feedback';
	if (title === 'Authoritative settlement') return 'Time until the server-confirmed update appears';
	if (title === 'Warm browser used heap') return 'Browser JavaScript memory after an interaction';
	if (title.includes('burst completion')) return 'Time to finish a batch of 16 requests';
	if (title.includes('sequential response')) return 'Time to receive one server response';
	if (title.includes('server heap')) return 'Server JavaScript memory after requests';
	if (title === 'SSR response size') return 'HTML response size';
	return title;
}

/** Explains what the timer or memory sample observes and the comparison its value supports. */
export function performanceMetricDescription(title: string, fallback: string): string {
	if (title === 'Navigation completion')
		return 'From starting navigation until the browser fires its load event. Lower milliseconds mean the document and load-blocking resources finished sooner. Interactive startup may continue after this event.';
	if (title === 'Largest contentful paint')
		return 'From navigation until the latest largest-content paint observed before Claim is clicked. This describes the initial dashboard content, with the observation window ending at the service-ready checkpoint.';
	if (title === 'Browser interaction latency')
		return 'Browser Event Timing duration for the first trusted Claim interaction, from input through its next paint. Related pointer events share one interaction. Values have browser timing quantization. This scripted lab measurement is not real-user INP.';
	if (title === 'Service connection readiness')
		return 'From navigation until the dashboard first displays Live service, measured inside the page. This includes client startup and connecting to the shared service. It is a scenario milestone, not a general time-to-interactive score.';
	if (title === 'Startup layout shift')
		return 'Largest session of unexpected layout shifts before Claim, excluding shifts associated with recent input. Sessions end after a one-second gap or five seconds. Lower scores mean less movement of visible content.';
	if (title === 'Startup script CPU')
		return 'JavaScript CPU time reported by Chromium at the service-ready checkpoint. This diagnostic includes application and framework work and measurement callbacks. It is not elapsed page-load time.';
	if (title === 'Startup long-task blocking')
		return 'Sum of the portions above 50 ms of main-thread long tasks observed from navigation to the pre-click checkpoint. This is an observed startup window, not Lighthouse Total Blocking Time. Zero does not establish that the page can handle an early click.';
	if (title === 'Client script payload')
		return 'Transferred JavaScript resource bytes recorded by the browser. These local replay responses are uncompressed. Lower kB mean fewer script bytes transferred for this page.';
	if (title === 'First contentful paint')
		return 'From starting navigation until the browser first paints text or an image. Lower milliseconds mean the visitor sees content sooner. The page may still be loading.';
	if (title === 'Optimistic feedback')
		return 'From clicking Claim on a fresh incident page until the DOM shows immediate local feedback. Lower milliseconds mean a faster acknowledgement of the click. The server has not yet confirmed the claim.';
	if (title === 'Authoritative settlement')
		return 'From the same Claim click until the DOM shows the server-confirmed result. This includes the request, shared service, response, and browser scheduling. Lower milliseconds mean earlier confirmation. The timer ends at the DOM update, before its next paint.';
	if (title === 'Warm browser used heap')
		return 'JavaScript memory retained after the interaction and garbage collection, which removes unreachable objects. Lower MB mean less retained JavaScript memory in this workload. This includes engine code and metadata and excludes parts of total browser-process memory.';
	if (title.includes('burst completion'))
		return 'Send 16 requests together and stop the timer when all responses have arrived. Lower milliseconds mean the server clears this batch sooner. No new requests replace completed ones during the batch.';
	if (title.includes('sequential response'))
		return 'Send one request at a time to an already-running server and measure until its complete response arrives. Lower milliseconds mean less waiting per request. Data fetching, HTML rendering, and local HTTP transfer are included.';
	if (title.includes('server heap'))
		return 'Sample retained JavaScript memory after batches of requests and garbage collection. Lower MB mean a smaller retained heap in this workload. Compare frameworks within the same runtime: Node and Bun account for memory differently.';
	if (title === 'SSR response size')
		return 'Bytes in the complete HTML response, including markup and the framework data needed to activate the page. Lower values mean a smaller document to transfer. Separately loaded scripts and styles are outside this measurement.';
	return fallback;
}
