package exactcompiler

// ComponentExecution is the target-neutral local subgraph shared by server
// and client lowering for one semantic component.
type ComponentExecution struct {
	Version     int                   `json:"version"`
	Ports       []ComponentPort       `json:"ports"`
	Transitions []ComponentTransition `json:"transitions"`
	Reactive    []ReactiveAllocation  `json:"reactive"`
}

// ComponentPort identifies one compact value source or publication target.
type ComponentPort struct {
	Index     int    `json:"index"`
	Kind      string `json:"kind"`
	Path      string `json:"path"`
	Direction string `json:"direction"`
}

// ComponentTransition wires one authored continuation invocation to local ports.
type ComponentTransition struct {
	ID          string `json:"id"`
	TaskID      string `json:"taskId"`
	Activation  string `json:"activation"`
	Placement   string `json:"placement"`
	Readiness   string `json:"readiness"`
	Concurrency string `json:"concurrency"`
	Inputs      []int  `json:"inputs"`
	Outputs     []int  `json:"outputs"`
	// DirectServerSetup is compiler-private: the server facet executes this synchronous
	// computation inline and does not publish a runtime transition for it.
	DirectServerSetup bool `json:"-"`
}

// ReactiveAllocation records whether lowering forwards, inlines, snapshots,
// or allocates an observable primitive for one lexical binding.
type ReactiveAllocation struct {
	Name         string   `json:"name"`
	Provenance   string   `json:"provenance"`
	Allocation   string   `json:"allocation"`
	Dependencies []string `json:"dependencies"`
}
