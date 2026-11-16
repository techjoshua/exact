package exactcompiler

import (
	"fmt"
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
)

// taskActivationSource is an immutable description of one ORIGINAL setup or
// interaction Call. It carries source routing only, never a selected value,
// live query, normal frame, Get/BODY/current/APPLIED or transport authority.
// A clone can retain the description only while the exact source/checker still
// matches. Native receiver/capture domains without an existing owner stay held.
type taskActivationSource struct {
	source                                  *ast.SourceFile
	checker                                 *checker.Checker
	call, work, target, receiver, component *ast.Node
	actuals                                 []*ast.Node
	receiverMode                            uint8
	hold                                    string
}

// taskRuntimeParameters erases only TypeScript's leading pseudo-this position.
// It is an immutable view; the checker-owned declaration and receiver type stay
// intact. Task defaults, policy slots and argument indices share this view.
func taskRuntimeParameters(work *ast.Node) []*ast.Node {
	parameters := work.Parameters()
	if len(parameters) > 0 && parameters[0].Name() != nil && ast.IsIdentifier(parameters[0].Name()) && parameters[0].Name().Text() == "this" {
		return parameters[1:]
	}
	return parameters
}

type taskReceiverFacts struct{ usesThis, usesArguments bool }

// Scoped to one collectTasks call and therefore one source/checker/Program.
// Only source facts are memoized; no invocation or graph authority is cached.
type taskSourceWorkFacts struct {
	browser, server                 bool
	receiver                        taskReceiverFacts
	adapterChecked, ownAdapterWrite bool
}

// describeTaskActivationSource normalizes once at the original owning task
// collector. Ordinary aliases are not adapters. It does not reinterpret an
// apply vector or replay bind captures into a new activation interval.
func describeTaskActivationSource(node, work, component *ast.Node, source *ast.SourceFile, c *checker.Checker, owner *executableBodyOwner, facts *taskSourceWorkFacts) *taskActivationSource {
	call := node.AsCallExpression()
	raw := callArguments(node)
	plan := planOrdinaryInvocation(call.Expression, raw, c, nil)
	if plan.adapterCount == 0 {
		candidate, name := restrictedInvocationMember(call.Expression, c)
		if candidate != nil && (name == "call" || name == "apply") && taskActivationTargetMatches(candidate, work, c) {
			return &taskActivationSource{source: source, checker: c, call: node, work: work, component: component, hold: "original native invocation route is not established"}
		}
		return nil
	}
	d := &taskActivationSource{source: source, checker: c, call: node, work: work, component: component, target: plan.target, receiver: plan.receiver}
	refuse := func(reason string) *taskActivationSource { d.hold = reason; return d }
	if plan.adapterCount != 1 || plan.adapterKinds != 1 {
		return refuse("native adapter receiver/vector or bound-capture acquisition is not connected to this task activation")
	}
	// The original canonical classifier supplied kind/count above. Read only
	// syntax here; a computed key with authored evaluation needs its own owner.
	var target *ast.Node
	expression := unwrapSourceCallableReference(call.Expression)
	switch {
	case ast.IsPropertyAccessExpression(expression):
		target = expression.Expression()
	case ast.IsElementAccessExpression(expression):
		key := expression.AsElementAccessExpression().ArgumentExpression
		if key == nil || !ast.IsStringLiteral(key) || key.Text() != "call" {
			return refuse("adapter method key acquisition is not connected")
		}
		target = expression.Expression()
	default:
		return refuse("native call source shape is unavailable")
	}
	if target == nil || len(raw) == 0 || plan.receiver != raw[0] || len(plan.actuals) != len(raw)-1 {
		return refuse("original standard call input route is incomplete")
	}
	for i, actual := range plan.actuals {
		if actual != raw[i+1] {
			return refuse("bound or reconstructed actual inputs have no activation capture owner")
		}
	}
	targetReference := unwrapSourceCallableReference(target)
	if !ast.IsIdentifier(targetReference) || owner == nil || owner.values == nil || owner.values.checker != c || ast.GetSourceFileOfNode(work) != source {
		return refuse("task target acquisition is not a current lexical source binding")
	}
	symbol := resolvedCallableSymbol(c.GetSymbolAtLocation(targetReference), c)
	if symbol == nil || symbol.ValueDeclaration == nil || owner.values.bindingWritten(symbol) {
		return refuse("task target binding is mutable or unavailable")
	}
	declaration := symbol.ValueDeclaration
	if ast.IsVariableDeclaration(declaration) && (declaration.Parent == nil || !ast.IsVariableDeclarationList(declaration.Parent) || declaration.Parent.Flags&ast.NodeFlagsConst == 0) {
		return refuse("task target alias lacks immutable source ownership")
	}
	if taskActivationTargetBody(plan.target, c) != work {
		return refuse("source task target and original native adapter disagree")
	}
	if !facts.adapterChecked {
		facts.ownAdapterWrite = taskActivationOwnWrite(work, source, c, owner)
		facts.adapterChecked = true
	}
	if facts.ownAdapterWrite {
		return refuse("authored invocation-adapter write requires its actual source consumer")
	}
	// The canonical source normalizer has already retained native adapter kind.
	// Do not replace the original stable binding by a reconstructed target AST.
	d.target = target
	if facts.receiver.usesArguments {
		return refuse("task body arguments receiver has no activation owner")
	}
	receiver := raw[0]
	if receiver.Kind == ast.KindThisKeyword && helperOwnsReceiver(receiver, component) {
		d.receiverMode = 1
	} else if ast.IsIdentifier(receiver) && c.IsUndefinedSymbol(c.GetSymbolAtLocation(receiver)) && (!facts.receiver.usesThis || ast.IsArrowFunction(work) && helperOwnsReceiver(work, component)) {
		d.receiverMode = 2
	} else {
		return refuse("task adapter receiver is not the original component or receiver-irrelevant checked undefined")
	}
	for _, actual := range raw[1:] {
		if ast.IsSpreadElement(actual) {
			return refuse("spread activation cardinality has no normalized task input owner")
		}
	}
	if len(c.GetSignaturesOfType(c.GetTypeAtLocation(plan.target), checker.SignatureKindCall)) > 1 {
		return refuse("adapted task overload selection is not connected")
	}
	d.actuals = raw[1:]
	return d
}

func (d *taskActivationSource) sourceCurrent(source *ast.SourceFile, call *ast.Node) bool {
	return d != nil && d.source == source && d.call == call && d.work != nil && ast.GetSourceFileOfNode(d.work) == source && ast.GetSourceFileOfNode(call) == source && len(callArguments(call)) == len(d.actuals)+1 && callArguments(call)[0] == d.receiver
}

// taskActivationActuals is shared by dependency planning and emission. Held
// activations never invent an empty vector; the Session coverage gate refuses
// their public metadata before either consumer can publish it.
func taskActivationActuals(task Task, call *ast.Node, source *ast.SourceFile) []*ast.Node {
	d := task.activationSource
	if d == nil {
		return callArguments(call)
	}
	if d.hold != "" || !d.sourceCurrent(source, call) {
		panic("Compiler analysis coverage gap: task activation source changed before its consumer")
	}
	return d.actuals
}

// taskActivationCoverageError uses the existing compiler-debt Error channel.
// Only classified task activations are considered. Ordinary calls in work and
// synchronous setup value consumers never acquire this descriptor or gate.
func taskActivationCoverageError(tasks []Task, source *ast.SourceFile, c *checker.Checker) string {
	for _, task := range tasks {
		if d := task.activationSource; d != nil {
			reason := d.hold
			if reason == "" && (d.checker != c || !d.sourceCurrent(source, d.call)) {
				reason = "task activation source association changed"
			}
			if reason != "" {
				return fmt.Sprintf("Compiler analysis coverage gap: task activation inputs at %s:%d remain pending (%s)", source.FileName(), d.call.Pos(), reason)
			}
		}
	}
	return ""
}

// Lexical aliases are resolved by the existing source normalizer, not a task
// heap interpreter. Binding mutability remains a separate admission condition.
func taskActivationTargetBody(target *ast.Node, c *checker.Checker) *ast.Node {
	target = unwrapSourceCallableReference(target)
	// The canonical invocation plan can retain an original body directly after
	// following a transparent const initializer. It is the same AST definition,
	// not a reconstructed target or selected runtime value.
	if target != nil && ast.IsFunctionLike(target) && target.Body() != nil {
		return target
	}
	if target == nil || !ast.IsIdentifier(target) {
		return nil
	}
	symbol := resolvedCallableSymbol(c.GetSymbolAtLocation(target), c)
	if symbol == nil || symbol.ValueDeclaration == nil {
		return nil
	}
	declaration := symbol.ValueDeclaration
	if ast.IsVariableDeclaration(declaration) {
		declaration = unwrapSourceCallableReference(declaration.Initializer())
	}
	return declaration
}
func taskActivationTargetMatches(target, work *ast.Node, c *checker.Checker) bool {
	if target == nil {
		return false
	}
	route := planOrdinaryInvocation(target, nil, c, nil)
	return route.adapterCount == 0 && taskActivationTargetBody(route.target, c) == work
}

// Reuse the generation's existing write/call index for known authored own-call
// mutations. Unrelated properties never require a pristine platform. This fact
// is memoized per body in the collection, not rescanned by every consumer.
func taskActivationOwnWrite(work *ast.Node, source *ast.SourceFile, c *checker.Checker, owner *executableBodyOwner) bool {
	index := owner.values.index(source)
	if index.incomplete {
		return true
	}
	for _, write := range index.dynamicMembers {
		root, key := restrictedInvocationMember(write.left, c)
		if key != "call" && key != "" && key != "*" {
			continue
		}
		if taskActivationTargetMatches(root, work, c) {
			return true
		}
	}
	for _, call := range index.calls {
		object, method := restrictedInvocationMember(call.Expression(), c)
		if object == nil || !ast.IsIdentifier(object) || (object.Text() != "Object" && object.Text() != "Reflect") {
			continue
		}
		if c.GetSymbolAtLocation(object) != c.GetGlobalSymbol(object.Text(), ast.SymbolFlagsValue, nil) {
			continue
		}
		arguments := callArguments(call)
		if len(arguments) == 0 || !taskActivationTargetMatches(arguments[0], work, c) {
			continue
		}
		switch method {
		case "setPrototypeOf":
			return true
		case "defineProperty":
			if len(arguments) > 1 {
				key := sourceMemberKey(arguments[1])
				if !key.resolved || key.name == "call" {
					return true
				}
			}
		case "defineProperties", "assign":
			for _, argument := range arguments[1:] {
				if !ast.IsObjectLiteralExpression(argument) {
					return true
				}
				for _, property := range argument.AsObjectLiteralExpression().Properties.Nodes {
					if ast.IsSpreadAssignment(property) || property.Name() == nil || ast.IsComputedPropertyName(property.Name()) || callableNameText(property.Name()) == "call" {
						return true
					}
				}
			}
		}
	}
	return false
}
