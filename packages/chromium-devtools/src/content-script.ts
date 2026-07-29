const port = chrome.runtime.connect({ name: 'exact-devtools-content' });
const source = 'exact-devtools-extension';
const pageSource = 'exact-devtools-page';
const script = document.createElement('script');
script.src = chrome.runtime.getURL('dist/page-bridge.js');
script.addEventListener('load', () => script.remove(), { once: true });
(document.documentElement ?? document.head).append(script);

port.onMessage.addListener((message) => {
	window.postMessage({ source, message }, '*');
});
window.addEventListener('message', (event) => {
	if (event.source !== window || event.data?.source !== pageSource) return;
	port.postMessage(event.data.message);
});
port.onDisconnect.addListener(() => {
	window.postMessage({ source, message: { id: 'disconnect', type: 'disconnect' } }, '*');
});
