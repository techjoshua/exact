package exactcompiler

import "fmt"

// InvokedTaskOperation is the transport-facing projection of one function-defined server task.
type InvokedTaskOperation struct {
	ID          string
	Component   string
	Placement   string
	Priority    string
	Concurrency string
	Arguments   []TaskDependency
	Reads       []StateEffect
	Writes      []StateEffect
	Contexts    []ContextEffect
	Start       int
	Length      int
}

// invokedTaskOperations projects invoked tasks without introducing a second authored work model.
func invokedTaskOperations(tasks []Task) []InvokedTaskOperation {
	operations := []InvokedTaskOperation{}
	for _, task := range tasks {
		if !task.Invoked {
			continue
		}
		operation := InvokedTaskOperation{
			ID:          task.ID,
			Component:   task.Component,
			Placement:   task.Placement,
			Priority:    task.Priority,
			Concurrency: task.Concurrency,
			Reads:       append([]StateEffect(nil), task.Reads...),
			Writes:      append([]StateEffect(nil), task.Writes...),
			Contexts:    append([]ContextEffect(nil), task.Contexts...),
			Start:       task.WorkStart,
			Length:      task.WorkLength,
		}
		for index := 0; index < task.ArgumentCount; index++ {
			operation.Arguments = append(operation.Arguments, TaskDependency{
				Index:  index,
				Source: "argument",
			})
		}
		operations = append(operations, operation)
	}
	return operations
}

// indexInvokedTaskOperations indexes transport projections by their task definition source span.
func indexInvokedTaskOperations(
	operations []InvokedTaskOperation,
) map[string]InvokedTaskOperation {
	result := make(map[string]InvokedTaskOperation, len(operations))
	for _, operation := range operations {
		result[fmt.Sprintf("%d:%d", operation.Start, operation.Length)] = operation
	}
	return result
}
