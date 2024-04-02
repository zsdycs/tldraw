import { StateNode, TLEventHandlers, TLFrameShape, TLTextShape } from '@tldraw/editor'
import { getTextLabels } from '../../../utils/shapes/shapes'
import { getHitShapeOnCanvasPointerDown } from '../../selection-logic/getHitShapeOnCanvasPointerDown'
import { updateHoveredId } from '../../selection-logic/updateHoveredId'

export class EditingShape extends StateNode {
	static override id = 'editing_shape'

	override onEnter = () => {
		const editingShape = this.editor.getEditingShape()
		if (!editingShape) throw Error('Entered editing state without an editing shape')
		updateHoveredId(this.editor)
		this.editor.select(editingShape)
	}

	override onExit = () => {
		const { editingShapeId } = this.editor.getCurrentPageState()
		if (!editingShapeId) return

		// Clear the editing shape
		this.editor.setEditingShape(null)

		const shape = this.editor.getShape(editingShapeId)!
		const util = this.editor.getShapeUtil(shape)

		// Check for changes on editing end
		util.onEditEnd?.(shape)
	}

	override onPointerMove: TLEventHandlers['onPointerMove'] = (info) => {
		switch (info.target) {
			case 'shape':
			case 'canvas': {
				updateHoveredId(this.editor)
				return
			}
		}
	}
	override onPointerDown: TLEventHandlers['onPointerDown'] = (info) => {
		switch (info.target) {
			case 'canvas': {
				const hitShape = getHitShapeOnCanvasPointerDown(this.editor)
				if (hitShape) {
					this.onPointerDown({
						...info,
						shape: hitShape,
						target: 'shape',
					})
					return
				}
				break
			}
			case 'shape': {
				const { shape: selectingShape } = info
				const editingShape = this.editor.getEditingShape()

				if (!editingShape) {
					throw Error('Expected an editing shape!')
				}

				// for shapes with labels, check to see if the click was inside of the shape's label
				const geometry = this.editor.getShapeUtil(selectingShape).getGeometry(selectingShape)
				const textLabels = getTextLabels(geometry)
				const textLabel = textLabels.length === 1 ? textLabels[0] : undefined
				// N.B. One nuance here is that we want empty text fields to be removed from the canvas when the user clicks away from them.
				const isEmptyTextShape =
					this.editor.isShapeOfType<TLTextShape>(editingShape, 'text') &&
					editingShape.props.text.trim() === ''
				if (textLabel && !isEmptyTextShape) {
					const pointInShapeSpace = this.editor.getPointInShapeSpace(
						selectingShape,
						this.editor.inputs.currentPagePoint
					)
					if (
						textLabel.bounds.containsPoint(pointInShapeSpace, 0) &&
						textLabel.hitTestPoint(pointInShapeSpace)
					) {
						// it's a hit to the label!
						if (selectingShape.id === editingShape.id) {
							// If we clicked on the editing geo / arrow shape's label, do nothing
							return
						} else {
							// Stay in edit mode to maintain flow of editing.
							this.editor.batch(() => {
								this.editor.mark('editing on pointer up')
								this.editor.select(selectingShape.id)

								const util = this.editor.getShapeUtil(selectingShape)
								if (this.editor.getInstanceState().isReadonly) {
									if (!util.canEditInReadOnly(selectingShape)) {
										this.parent.transition('pointing_shape', info)
										return
									}
								}

								this.editor.setEditingShape(selectingShape.id)
								this.editor.setCurrentTool('select.editing_shape')
							})
							return
						}
					}
				} else {
					if (selectingShape.id === editingShape.id) {
						// If we clicked on a frame, while editing its heading, cancel editing
						if (this.editor.isShapeOfType<TLFrameShape>(selectingShape, 'frame')) {
							this.editor.setEditingShape(null)
						}
						// If we clicked on the editing shape (which isn't a shape with a label), do nothing
					} else {
						// But if we clicked on a different shape of the same type, transition to pointing_shape instead
						this.parent.transition('pointing_shape', info)
						return
					}
					return
				}
				break
			}
		}

		// still here? Cancel editing and transition back to select idle
		this.parent.transition('idle', info)
		// then feed the pointer down event back into the state chart as if it happened in that state
		this.editor.root.handleEvent(info)
	}

	override onComplete: TLEventHandlers['onComplete'] = (info) => {
		this.parent.transition('idle', info)
	}

	override onCancel: TLEventHandlers['onCancel'] = (info) => {
		this.parent.transition('idle', info)
	}
}