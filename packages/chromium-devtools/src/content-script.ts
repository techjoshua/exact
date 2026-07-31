const port = chrome.runtime.connect({ name: 'exact-devtools-content' });
const source = 'exact-devtools-extension';
const pageSource = 'exact-devtools-page';
let connected = true;

port.onMessage.addListener((message) => {
	if (!connected) return;
	window.postMessage({ source, message }, '*');
});
window.addEventListener('message', forwardPageMessage);
port.onDisconnect.addListener(() => {
	// Reading lastError inside the disconnect callback acknowledges connection failures reported by
	// Chromium. Remove the page listener before notifying the hook so its acknowledgement cannot be
	// forwarded through the already-closed port.
	void chrome.runtime.lastError;
	connected = false;
	window.removeEventListener('message', forwardPageMessage);
	window.postMessage({ source, message: { id: 'disconnect', type: 'disconnect' } }, '*');
});

function forwardPageMessage(event: MessageEvent): void {
	if (!connected || event.source !== window || event.data?.source !== pageSource) return;
	port.postMessage(event.data.message);
}
