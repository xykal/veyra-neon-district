extends Control
# UI look-preview stage: drag to rotate the lobby character 360°.
var owner_ui
var drag_id=-1
var last=Vector2.ZERO
func _ready():mouse_filter=Control.MOUSE_FILTER_STOP
func _gui_input(event):
 if owner_ui==null or owner_ui.app==null:return
 if event is InputEventScreenDrag:
  owner_ui.app.rotate_preview(event.relative.x);accept_event()
 elif event is InputEventMouseButton and event.button_index==MOUSE_BUTTON_LEFT:
  if event.pressed:drag_id=-2;last=event.position
  else:drag_id=-1
  accept_event()
 elif event is InputEventMouseMotion and drag_id==-2:
  owner_ui.app.rotate_preview(event.relative.x);accept_event()
