package exactcompiler

import (
	"bytes"
	"encoding/json"
	"fmt"
)

// AnalysisOptions is application-owned advisory policy. It never grants source
// authority and never supplies execution fuel to a query or child activation.
type AnalysisOptions struct {
	EstimatedCostWarningThreshold json.RawMessage `json:"estimatedCostWarningThreshold,omitempty"`
}

// warningThreshold validates the transport option without affecting semantics.
// A missing option uses the provisional warning threshold. False disables only
// the warning, not analysis or source diagnostics.
func (p AnalysisOptions) warningThreshold() (uint64, bool, error) {
	if len(p.EstimatedCostWarningThreshold) == 0 {
		return 4096, true, nil
	}
	raw := bytes.TrimSpace(p.EstimatedCostWarningThreshold)
	if bytes.Equal(raw, []byte("false")) {
		return 0, false, nil
	}
	var value float64
	err := json.Unmarshal(raw, &value)
	if err != nil || value <= 0 || value > 9007199254740991 || value != float64(uint64(value)) {
		return 0, false, fmt.Errorf("analysis.estimatedCostWarningThreshold must be a positive safe integer or false")
	}
	return uint64(value), true, nil
}

// estimatedCostSum saturates diagnostic arithmetic. Saturation is never an
// allocation bound or a reason to refuse an otherwise authenticated operation.
func estimatedCostSum(a, b int) int {
	if a < 0 || b < 0 || a > int(^uint(0)>>1)-b {
		return int(^uint(0) >> 1)
	}
	return a + b
}

// recordEstimatedCost updates existing owner statistics without depleting a
// budget. The maximum is enough to reclassify an advisory warning from cached
// facts without retaining query capabilities or replaying a body.
func (q *sourceValueQuery) recordEstimatedCost(n int) {
	if q == nil || q.owner == nil {
		return
	}
	q.estimatedCost = estimatedCostSum(q.estimatedCost, n)
	if q.estimatedCost > q.owner.estimatedCostMaximum {
		q.owner.estimatedCostMaximum = q.estimatedCost
	}
}

// appendAnalysisCost projects one advisory summary after the request. Cached
// semantic facts remain reusable when only the reporting threshold changes.
func (s *Session) appendAnalysisCost(request Request, project *projectState, response *Response) {
	if response.Error != "" || (request.Kind != "compile" && request.Kind != "analyze" && request.Kind != "check") {
		return
	}
	maximum := 0
	if project != nil && project.callableCache != nil && project.callableCache.owner != nil && project.callableCache.owner.values != nil {
		maximum = project.callableCache.owner.values.estimatedCostMaximum
	}
	if request.TraceAnalysisCost {
		response.Counters.EstimatedAnalysisCost = maximum
	}
	for _, diagnostic := range response.Diagnostics {
		if diagnostic.Code == "EXACT_ANALYSIS_COST" {
			return
		}
	}
	threshold, enabled, err := request.Analysis.warningThreshold()
	if err != nil || !enabled || uint64(maximum) <= threshold {
		return
	}
	response.Diagnostics = append(response.Diagnostics, Diagnostic{Severity: "warning", Code: "EXACT_ANALYSIS_COST", FileName: request.ID, Message: fmt.Sprintf("Compiler analysis estimated cost %d exceeds advisory threshold %d. Analysis was not restricted. Configure analysis.estimatedCostWarningThreshold to adjust or disable this warning.", maximum, threshold)})
}
