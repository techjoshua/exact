package exactcompiler

import (
	"slices"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
)

// sourceReflectiveCopyProjection lends selection only to the original Call
// currently producing a possible descriptor target or fresh prototype Get. Its
// creating scope belongs to the reader. Input and mutation effects retain their
// original owners.
type sourceReflectiveCopyProjection struct {
	issuer        *sourceValueQuery
	calls         []*ast.Node
	createdGetter *sourceCreatedGetter
}

func (projection *sourceReflectiveCopyProjection) beginCall(call *ast.Node) (func(), bool) {
	if slices.Contains(projection.calls, call) {
		return nil, false
	}
	previous := projection.calls
	projection.calls = append(previous, call)
	return func() { projection.calls = previous }, true
}

// sourceCopyMember identifies the direct source shape. The original Get must
// still select the standard declaration before the copy projection runs.
func sourceCopyMember(call *ast.Node) string {
	if call == nil || !ast.IsCallExpression(call) || call.AsCallExpression().QuestionDotToken != nil {
		return ""
	}
	member := call.Expression()
	if !ast.IsPropertyAccessExpression(member) || ast.IsOptionalChain(member) || !ast.IsIdentifier(member.Expression()) || member.Expression().Text() != "Object" {
		return ""
	}
	switch name := member.Name().Text(); name {
	case "assign", "create":
		return name
	}
	return ""
}

// sourceHasCopyInitializer avoids reopening ordinary unrelated return
// producers. The actual native member lookup still owns semantic selection.
func sourceHasCopyInitializer(source *ast.Node, c *checker.Checker) bool {
	source = unwrapSourceCallableReference(source)
	if source == nil {
		return false
	}
	if ast.IsConditionalExpression(source) {
		option := source.AsConditionalExpression()
		return sourceHasCopyInitializer(option.WhenTrue, c) || sourceHasCopyInitializer(option.WhenFalse, c)
	}
	return sourceCopyMember(source) == "assign" && standardLibraryCallRoot(source.Expression(), c)
}

func (q *sourceValueQuery) reflectiveCopyMember(key string) bool {
	p := q.reflectiveCopy
	if p == nil || p.issuer != q || len(p.calls) == 0 || q.protectedMember != p.calls[len(p.calls)-1].Expression() {
		return false
	}
	return sourceCopyMember(p.calls[len(p.calls)-1]) == key
}

func (q *sourceValueQuery) reflectiveCopyInvocation(call *ast.Node, kind sourceNativeKind) bool {
	p := q.reflectiveCopy
	if p == nil || p.issuer != q || len(p.calls) == 0 || p.calls[len(p.calls)-1] != call {
		return false
	}
	member := sourceCopyMember(call)
	return kind == sourceNativeObjectAssign && member == "assign" || kind == sourceNativeObjectCreate && member == "create"
}

// reflectiveCopiedReceiver retains one positive alternative for the original
// writer. Its caller keeps uncertainty even when this allocation matches.
func (q *sourceValueQuery) reflectiveCopiedReceiver(target, operation, origin, owner, invocation *ast.Node, bindings sourceValueBindings) *sourceValue {
	if q.reflectiveCopy != nil {
		return nil
	}
	projection := sourceReflectiveCopyProjection{issuer: q}
	q.reflectiveCopy = &projection
	defer func() { q.reflectiveCopy = nil }()
	part := accessorCandidates{}
	targets := q.occurrenceOrigins(target, operation, origin, bindings, &part)
	projected, _, _, _ := q.reflectiveTargetValues(targets, bindings, &part, operation)
	for _, value := range projected {
		if value.node == origin && len(value.path) == 0 && value.capture != nil && q.sourceCreatorValue(value, owner, invocation) {
			return &value
		}
	}
	return nil
}

// publishReflectiveCopyTarget transfers only the selected alternative's source
// relationship. A successful Object.assign returns its original object target.
// Selected Object.create(null) supplies its own creating occurrence. Other
// alternatives and normal outputs remain incomplete.
func (q *sourceValueQuery) publishReflectiveCopyTarget(site *ast.Node, kind sourceNativeKind, bindings sourceValueBindings, project func(sourceValue, sourceValueBindings), result *accessorCandidates) {
	result.valueIncomplete = true
	if project == nil {
		return
	}
	args := restrictedInvocationArguments(site.AsCallExpression())
	if kind == sourceNativeObjectCreate {
		if getter := q.reflectiveCopy.createdGetter; getter != nil && getter.creation == site {
			if getter.stored != nil {
				scope := q.acquireCallableScope(bindings, result)
				getter.stored(sourceValue{node: getter.body, capture: &scope})
			} else {
				q.sourceCreatedGetterRead(getter, bindings, result)
			}
			return
		}
		if len(args) == 1 && unwrapSourceCallableReference(args[0]).Kind == ast.KindNullKeyword {
			scope := q.acquireCallableScope(bindings, result)
			project(sourceValue{node: site, capture: &scope}, bindings)
		}
		return
	}
	if len(args) != 2 || ast.IsSpreadElement(args[0]) || ast.IsSpreadElement(args[1]) {
		return
	}
	acquisition := accessorCandidates{}
	for _, target := range q.originsAt(args[0], site, bindings, &acquisition) {
		if target.node == nil || len(target.path) != 0 {
			continue
		}
		if ast.IsObjectLiteralExpression(target.node) {
			if target.capture == nil {
				scope := q.acquireCallableScope(bindings, result)
				target.capture = &scope
			}
			project(target, bindings)
			continue
		}
		if sourceCopyMember(target.node) != "create" {
			continue
		}
		part := q.projectSourceCallReturns(target.node, bindings, sourceCallResultInterest{purpose: resultSourceProjection}, project, func() { result.valueIncomplete = true })
		mergeAccessorCandidates(result, part)
	}
	mergeAccessorCandidates(result, acquisition)
}
