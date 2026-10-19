extends SceneTree
func _init():
	var packed=load("res://scenes/main.tscn")
	var scene=packed.instantiate()
	root.add_child(scene)
	await create_timer(6.0).timeout
	var ui=null
	if scene.has_method("get_node"):ui=scene.get_node_or_null("Main/UI")
	# fallback: find UI script node
	if ui==null:
		for c in scene.get_children():
			if c.has_method("set_loading"):ui=c
	var app=scene
	for c in scene.get_children():
		if c.get("prefs")!=null:app=c
	if ui:
		ui.set_loading(false,1.0,"")
		if ui.has_method("show_menu"):ui.show_menu()
	await create_timer(1.2).timeout
	var img=root.get_viewport().get_texture().get_image()
	print("LOBBY result=",img.save_png("/home/user/kota-mp/native/screenshots/diag/lobby_new.png"))
	if ui:
		ui.set_loading(true,0.62,"Menyusun distrik Lombok…")
		await create_timer(0.8).timeout
		img=root.get_viewport().get_texture().get_image()
		print("LOADING result=",img.save_png("/home/user/kota-mp/native/screenshots/diag/loading_new.png"))
	print("UI_SHOT_OK")
	quit(0)
