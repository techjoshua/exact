package exactcompiler

import (
	"fmt"
	"sort"
)

// assignTaskIDs applies the compiler/runtime protocol identity after task
// discovery, preserving source order independently for each owning component.
func assignTaskIDs(
	tasks []Task,
	components []Component,
	identityFilename string,
) {
	componentOrder := make(map[string]int, len(components))
	for index, component := range components {
		componentOrder[component.Name] = index
	}
	sort.SliceStable(tasks, func(left int, right int) bool {
		leftOwner, leftExists := componentOrder[tasks[left].Component]
		rightOwner, rightExists := componentOrder[tasks[right].Component]
		if leftExists && rightExists && leftOwner != rightOwner {
			return leftOwner < rightOwner
		}
		return tasks[left].Start < tasks[right].Start
	})
	indices := make(map[string]int, len(components))
	for index := range tasks {
		component := tasks[index].Component
		taskIndex := indices[component]
		tasks[index].ID = exactStableID(
			identityFilename,
			fmt.Sprintf("%s:task:%d", component, taskIndex),
		)
		indices[component] = taskIndex + 1
	}
}
