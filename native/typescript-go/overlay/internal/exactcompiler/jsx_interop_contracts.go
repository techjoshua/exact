package exactcompiler

// JSXInterop identifies the host-owned runtime brand adapter for component
// values that cannot be proven to be local native eXact components.
type JSXInterop struct {
	AdapterModule        string                     `json:"adapterModule"`
	AdapterExport        string                     `json:"adapterExport"`
	ClientRendererModule string                     `json:"clientRendererModule,omitempty"`
	ExactComponents      []JSXInteropExactComponent `json:"exactComponents,omitempty"`
}

// JSXInteropExactComponent is one host-classified import that remains on the native target ABI.
type JSXInteropExactComponent struct {
	ModuleSpecifier string `json:"moduleSpecifier"`
	ExportName      string `json:"exportName"`
}
