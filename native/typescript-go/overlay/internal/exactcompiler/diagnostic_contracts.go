package exactcompiler

// DiagnosticLocation identifies a causal operation, including one in an imported helper.
type DiagnosticLocation struct {
	source   string
	Line     int    `json:"line"`
	Column   int    `json:"column"`
	FileName string `json:"filename"`
	Start    int    `json:"start"`
	Length   int    `json:"length"`
	Message  string `json:"message"`
}

// Diagnostic is an implementation-independent compiler diagnostic.
type Diagnostic struct {
	source   string
	Line     int                  `json:"line,omitempty"`
	Column   int                  `json:"column,omitempty"`
	Related  []DiagnosticLocation `json:"related,omitempty"`
	Severity string               `json:"severity"`
	Code     string               `json:"code"`
	Message  string               `json:"message"`
	FileName string               `json:"filename,omitempty"`
	Start    int                  `json:"start,omitempty"`
	Length   int                  `json:"length,omitempty"`
	FixStart int                  `json:"fixStart,omitempty"`
	FixText  string               `json:"fixText,omitempty"`
}
