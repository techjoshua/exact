const contentPorts = new Map<number, chrome.runtime.Port>();
const panelPorts = new Map<number, Set<chrome.runtime.Port>>();

chrome.runtime.onConnect.addListener((port) => {
	const contentTab = port.sender?.tab?.id;
	const panelTab = port.name.startsWith('exact-devtools-panel:')
		? Number(port.name.slice('exact-devtools-panel:'.length))
		: undefined;
	if (port.name === 'exact-devtools-content' && contentTab !== undefined) {
		contentPorts.set(contentTab, port);
		port.onMessage.addListener((message) => {
			for (const panel of panelPorts.get(contentTab) ?? []) panel.postMessage(message);
		});
		port.onDisconnect.addListener(() => contentPorts.delete(contentTab));
		return;
	}
	if (panelTab === undefined || !Number.isSafeInteger(panelTab)) return;
	let panels = panelPorts.get(panelTab);
	if (!panels) panelPorts.set(panelTab, (panels = new Set()));
	panels.add(port);
	port.onMessage.addListener((message) => contentPorts.get(panelTab)?.postMessage(message));
	port.onDisconnect.addListener(() => {
		panels!.delete(port);
		if (!panels!.size) panelPorts.delete(panelTab);
	});
});
