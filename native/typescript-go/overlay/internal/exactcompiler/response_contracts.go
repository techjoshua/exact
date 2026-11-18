package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/core"
	"github.com/microsoft/TypeScript/tsc/internal/sourcemap"
)

// Response is one newline-delimited result emitted by a Session.
type Response struct {
	ExecutableSlotsVersion int                                 `json:"executableSlotsVersion"`
	ExecutableSlots        []ExecutableSlotFact                `json:"executableSlots"`
	ExecutableSelection    *executableSelectionAcknowledgement `json:"executableSelection,omitempty"`
	ProjectFiles           []string                            `json:"projectFiles,omitempty"`
	ID                     string                              `json:"id,omitempty"`
	ProtocolVersion        string                              `json:"protocolVersion"`
	TypeScriptVersion      string                              `json:"typescriptVersion"`
	BackendVersion         string                              `json:"backendVersion"`
	Code                   string                              `json:"code"`
	RuntimeDependencies    []string                            `json:"runtimeDependencies,omitempty"`
	SourceMap              *sourcemap.RawSourceMap             `json:"sourceMap,omitempty"`
	Diagnostics            []Diagnostic                        `json:"diagnostics"`
	Analysis               Analysis                            `json:"analysis"`
	Timings                Timings                             `json:"timings"`
	Counters               WorkCounters                        `json:"counters"`
	Structure              ArtifactStructure                   `json:"structure"`
	CacheHit               bool                                `json:"cacheHit,omitempty"`
	Error                  string                              `json:"error,omitempty"`
	Extension              any                                 `json:"extension,omitempty"`
}

// NewResponseVersionFields returns the versions required on every response,
// including malformed-request and early-failure responses.
func NewResponseVersionFields(response *Response) {
	response.ExecutableSlotsVersion = ExecutableSlotsVersion
	response.ProtocolVersion = ProtocolVersion
	response.TypeScriptVersion = core.Version()
	response.BackendVersion = BackendVersion
}

// executableSelectionAcknowledgement binds successful synchronization to the exact
// internal executable snapshot. Older binaries may ignore requests, so callers require it.
type executableSelectionAcknowledgement struct {
	Generation uint64 `json:"generation"`
	Revision   string `json:"revision"`
	Target     Target `json:"target"`
}

// newSessionResponse keeps syntax-only and semantic request envelopes consistent.
func newSessionResponse(id string) Response {
	response := Response{
		ID:          id,
		Diagnostics: []Diagnostic{},
		Analysis: NewAnalysis(
			nil, nil, nil, nil, nil, nil, nil, nil, nil, nil, nil, nil, nil,
			nil, nil, nil, nil, PartitionPlan{}, nil,
			newPolicyAnalysis(),
			CapabilityRequirements{},
			nil,
			SemanticGraph{},
		),
	}
	NewResponseVersionFields(&response)
	return response
}
