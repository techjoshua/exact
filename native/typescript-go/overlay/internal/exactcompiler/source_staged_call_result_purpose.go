package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// sourceCallResultPurpose belongs to the original source consumer. A request
// for callable exposure cannot stand in for target or receiver provenance.
type sourceCallResultPurpose uint8

const (
	resultPurposeInvalid sourceCallResultPurpose = iota
	resultSourceProjection
	resultCallableExposure
	resultReflectiveTarget
	resultConstructedReceiver
	resultWriterValue
)

// sourceCallResultInterest is a detached description, not a result receipt.
// operation identifies the original reflective writer only for target reads.
type sourceCallResultInterest struct {
	purpose   sourceCallResultPurpose
	operation *ast.Node
}

func validSourceCallResultInterest(interest sourceCallResultInterest) bool {
	switch interest.purpose {
	case resultSourceProjection, resultCallableExposure, resultConstructedReceiver, resultWriterValue:
		return interest.operation == nil
	case resultReflectiveTarget:
		return interest.operation != nil && ast.IsCallExpression(interest.operation)
	default:
		return false
	}
}
