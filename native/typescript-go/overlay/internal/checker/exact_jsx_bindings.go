package checker

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// ExactJsxBindingInference supplies an original source value for a finite component prop.
// The compiler proves property membership before asking the checker to infer its type.
type ExactJsxBindingInference struct {
	Name  string
	Value *ast.Node
}

// InferExactJsxBindingSignature applies ordinary JSX inference with compiler-owned value props.
// The caller supplies one generic call signature, no explicit JSX type arguments, and original
// source targets for existing finite props. No source AST or resolved-signature cache is replaced.
// Generated assignment checking still validates each notification and the expanded prop bag.
func (c *Checker) InferExactJsxBindingSignature(node *ast.Node, signature *Signature, bindings []ExactJsxBindingInference) *Signature {
	context := c.newInferenceContext(signature.typeParameters, signature, InferenceFlagsNone, nil)
	props := c.getEffectiveFirstArgumentForJsxSignature(signature, node)
	attributes := c.checkExpressionWithContextualType(node.Attributes(), props, context, CheckModeNormal)
	c.inferTypes(context.inferences, attributes, props, InferencePriorityNone, false)
	for _, binding := range bindings {
		c.inferTypes(context.inferences, c.GetTypeAtLocation(binding.Value), c.getTypeOfPropertyOfType(props, binding.Name), InferencePriorityNone, false)
	}
	return c.getSignatureInstantiation(signature, c.getInferredTypes(context), false, nil)
}
