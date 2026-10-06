package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
)

// policyInvocationAcceptsSecret validates declared receipt for every expanded argument slot.
// Unknown spreads require a qualified rest contract. Native forwarders use the receiver's
// declarations, never the inferred generic parameters of Function.call/apply/bind.
func policyInvocationAcceptsSecret(node *ast.Node, arguments []policyInvocationArgument, index int, signature *checker.Signature, c *checker.Checker) bool {
	signatures := []*checker.Signature{signature}
	forward := policyNativeForwarder(policyInvocationTarget(node), c)
	if forward != "" {
		receiver, _ := restrictedInvocationMember(policyInvocationTarget(node), c)
		signatures = c.GetSignaturesOfType(c.GetTypeAtLocation(receiver), checker.SignatureKindCall)
		if len(signatures) == 0 && forward == "bind" {
			signatures = c.GetSignaturesOfType(c.GetTypeAtLocation(receiver), checker.SignatureKindConstruct)
		}
		if len(signatures) == 0 || index == 0 {
			return false
		}
	}
	start := 0
	unknownPrefix := false
	first := 0
	if forward != "" {
		first = 1
	}
	for _, argument := range arguments[first:index] {
		if ast.IsSpreadElement(argument.value) {
			if length, fixed := policyFixedSpreadLength(argument.value.AsSpreadElement().Expression, c); fixed {
				start += length
			} else {
				unknownPrefix = true
			}
		} else {
			start++
		}
	}
	if ast.IsTaggedTemplateExpression(node) {
		start++
	}
	value := arguments[index].value
	spread := ast.IsSpreadElement(value) || forward == "apply"
	if ast.IsSpreadElement(value) {
		value = value.AsSpreadElement().Expression
	}
	length := 1
	unknown := unknownPrefix
	if spread {
		var fixed bool
		length, fixed = policyFixedSpreadLength(value, c)
		unknown = unknown || !fixed
	}
	for _, candidate := range signatures {
		if candidate == nil {
			return false
		}
		for candidate.Target() != nil {
			candidate = candidate.Target()
		}
		if unknown {
			if !c.HasEffectiveRestParameter(candidate) {
				return false
			}
			// Include the rest slot and all fixed positions potentially crossed by the spread.
			length = len(candidate.Parameters()) + 1
		}
		for offset := 0; offset < length; offset++ {
			if !signatureAcceptsSecret(candidate, start+offset, value, c) {
				return false
			}
		}
	}
	return true
}

// policyFixedSpreadLength uses native tuple metadata without evaluating source expressions.
func policyFixedSpreadLength(value *ast.Node, c *checker.Checker) (int, bool) {
	t := c.GetTypeAtLocation(value)
	if !checker.IsTupleType(t) {
		return 0, false
	}
	flags := t.TargetTupleType().ElementFlags()
	for _, flag := range flags {
		if flag != checker.ElementFlagsRequired {
			return 0, false
		}
	}
	return len(flags), true
}

// policyNativeForwarder trusts only unaugmented methods declared by the native Function library.
// A user method with the same spelling remains an ordinary helper contract.
func policyNativeForwarder(expression *ast.Node, c *checker.Checker) string {
	receiver, name := restrictedInvocationMember(expression, c)
	if receiver == nil {
		return ""
	}
	if name != "call" && name != "apply" && name != "bind" {
		return ""
	}
	symbol := c.GetPropertyOfType(c.GetTypeAtLocation(receiver), name)
	if symbol == nil || len(symbol.Declarations) == 0 {
		return ""
	}
	for _, declaration := range symbol.Declarations {
		if !c.IsLibSymbolForHoverVerbosity(&ast.Symbol{Declarations: []*ast.Node{declaration}}) || declaration.Parent == nil || !ast.IsInterfaceDeclaration(declaration.Parent) {
			return ""
		}
		owner := declaration.Parent.AsInterfaceDeclaration().Name().Text()
		if owner != "Function" && owner != "CallableFunction" && owner != "NewableFunction" {
			return ""
		}
	}
	return name
}
