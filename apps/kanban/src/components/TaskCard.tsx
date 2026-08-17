import type { Component } from '@exactjs/core';
import { BoardContext } from '../context.js';
import type { Task } from '../types.js';

type TaskCardProps = {
	task: Task;
};

/** Renders one draggable kanban task card. */
export function TaskCard(this: Component<{}>, props: TaskCardProps) {
	const board = this.getContext(BoardContext);
	let drag:
		| {
				card: HTMLElement;
				pointerId: number;
				startX: number;
				startY: number;
				clone?: HTMLElement;
				dragging: boolean;
		  }
		| undefined;

	const startPointerDrag = (event: PointerEvent) => {
		if (event.button !== 0 || isInteractiveTarget(event.target)) return;

		const card = (event.target as HTMLElement | null)?.closest('.card') as HTMLElement | null;
		if (!card) return;

		card.setPointerCapture(event.pointerId);
		drag = {
			card,
			pointerId: event.pointerId,
			startX: event.clientX,
			startY: event.clientY,
			dragging: false
		};
	};

	const movePointerDrag = (event: PointerEvent) => {
		if (!drag || event.pointerId !== drag.pointerId) return;
		const deltaX = event.clientX - drag.startX;
		const deltaY = event.clientY - drag.startY;
		if (!drag.dragging) {
			// Pointer jitter is normal for a click. Do not mutate board preview
			// state until this interaction is unambiguously a drag.
			if (Math.hypot(deltaX, deltaY) <= 4) return;
			drag.dragging = true;
			const rect = drag.card.getBoundingClientRect();
			drag.clone = drag.card.cloneNode(true) as HTMLElement;
			drag.clone.classList.add('dragging');
			drag.clone.style.left = `${rect.left}px`;
			drag.clone.style.top = `${rect.top}px`;
			drag.clone.style.width = `${rect.width}px`;
			document.body.appendChild(drag.clone);
			drag.card.classList.add('drag-source');
			this.log.debug('pointer dragstart', { taskId: props.task.id });
		}
		drag.clone?.style.setProperty('transform', `translate(${deltaX}px, ${deltaY}px)`);
		const placement = findDropPlacement(props.task.id, event.clientX, event.clientY);
		if (placement) board.previewTaskDrop(props.task.id, placement.status, placement.beforeTaskId);
		else board.clearTaskDropPreview();
	};

	const endPointerDrag = (event: PointerEvent) => {
		if (!drag || event.pointerId !== drag.pointerId) return;
		const current = drag;
		drag = undefined;
		current.clone?.remove();
		current.card.classList.remove('drag-source');
		if (current.card.hasPointerCapture(current.pointerId))
			current.card.releasePointerCapture(current.pointerId);

		const placement = findDropPlacement(props.task.id, event.clientX, event.clientY);
		this.log.debug('pointer dragend', {
			taskId: props.task.id,
			dragging: current.dragging,
			status: placement?.status,
			beforeTaskId: placement?.beforeTaskId
		});

		if (current.dragging && placement)
			board.commitTaskDrop(props.task.id, placement.status, placement.beforeTaskId);
		else board.clearTaskDropPreview();
	};

	const cancelPointerDrag = (reason = 'cancel') => {
		if (!drag) return;
		const current = drag;
		drag = undefined;
		current.clone?.remove();
		current.card.classList.remove('drag-source');
		if (current.card.hasPointerCapture(current.pointerId))
			current.card.releasePointerCapture(current.pointerId);
		board.clearTaskDropPreview();
		this.log.debug('pointer dragcancel', {
			taskId: props.task.id,
			reason,
			dragging: current.dragging
		});
	};

	this.onUnmount(() => cancelPointerDrag('unmount'));

	const hasNotes = props.task.notes.trim().length > 0;

	return () => (
		<div
			className="card"
			data-task-id={props.task.id}
			onMouseDown={(event) => {
				this.log.debug('card mousedown', {
					taskId: props.task.id,
					target: targetName(event.target)
				});
			}}
			onPointerDown={(event) => startPointerDrag(event)}
			onPointerMove={(event) => movePointerDrag(event)}
			onPointerUp={(event) => endPointerDrag(event)}
			onPointerCancel={(event) => endPointerDrag(event)}
			onLostPointerCapture={() => cancelPointerDrag('lostpointercapture')}
		>
			<span
				className="drag-handle"
				onClick={(event) => {
					event.stopPropagation();
				}}
			>
				Drag
			</span>
			<p className="card-title">{props.task.title}</p>
			{hasNotes ? <p className="card-notes">Has notes</p> : null}
			<div className="card-actions">
				<button
					theme:action="quiet"
					type="button"
					className="secondary-button"
					onClick={(event) => {
						event.stopPropagation();
						board.openTask(props.task);
					}}
				>
					Notes
				</button>
				<button
					theme:action="quiet"
					type="button"
					onClick={(event) => {
						event.stopPropagation();
						board.removeTask(props.task);
					}}
				>
					Remove
				</button>
			</div>
		</div>
	);
}

type DropPlacement = {
	status: 'todo' | 'doing' | 'done';
	beforeTaskId?: string;
};

function findDropPlacement(
	draggedTaskId: string,
	clientX: number,
	clientY: number
): DropPlacement | undefined {
	const column = document
		.elementFromPoint(clientX, clientY)
		?.closest('.column') as HTMLElement | null;
	if (!column) return undefined;
	const status = column?.id.replace('column-', '');
	if (status !== 'todo' && status !== 'doing' && status !== 'done') return undefined;

	const cards = Array.from(column.querySelectorAll<HTMLElement>('.card[data-task-id]')).filter(
		(card) => card.dataset.taskId !== draggedTaskId
	);
	for (const card of cards) {
		const rect = card.getBoundingClientRect();
		if (clientY < rect.top + rect.height / 2) {
			return {
				status,
				beforeTaskId: card.dataset.taskId
			};
		}
	}

	return { status };
}

function targetName(target: EventTarget | null): string {
	if (target instanceof Element) return target.tagName.toLowerCase();
	if (target instanceof Node) return `node:${target.nodeName}`;
	return 'unknown';
}

function isInteractiveTarget(target: EventTarget | null): boolean {
	return target instanceof Element && Boolean(target.closest('button, input, select, textarea'));
}
