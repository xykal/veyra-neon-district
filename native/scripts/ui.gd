extends CanvasLayer

const Touch=preload("res://scripts/touch_controls.gd")
var app
var root:Control
var menu:PanelContainer
var hud:Control
var pause_panel:PanelContainer
var gps_panel:PanelContainer
var chat_panel:PanelContainer
var name_input:LineEdit
var status_label:Label
var stats_label:Label
var prompt:Button
var chat_log:RichTextLabel
var chat_input:LineEdit
var touch
var hp_bar:ProgressBar
var stamina_bar:ProgressBar
var toast:Label
var toast_time=0.0
var gps_title:Label
var crosshair:Label
var palette=[Color("c8e6b5"),Color("72b4b2"),Color("8caac0")]
func setup(game):
 app=game;root=Control.new();root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT);root.mouse_filter=Control.MOUSE_FILTER_IGNORE;add_child(root)
 var theme=Theme.new();theme.default_font_size=16
 var style=StyleBoxFlat.new();style.bg_color=Color("0c1c2dee");style.border_color=Color("375365");style.set_border_width_all(1);style.set_corner_radius_all(12);style.content_margin_left=22;style.content_margin_right=22;style.content_margin_top=18;style.content_margin_bottom=18
 theme.set_stylebox("panel","PanelContainer",style)
 var button=StyleBoxFlat.new();button.bg_color=Color("213a4b");button.border_color=Color("44616a");button.set_border_width_all(1);button.set_corner_radius_all(7);button.content_margin_left=14;button.content_margin_right=14;button.content_margin_top=11;button.content_margin_bottom=11;theme.set_stylebox("normal","Button",button)
 var hover=button.duplicate();hover.bg_color=Color("375b60");theme.set_stylebox("hover","Button",hover);root.theme=theme
 _menu();_hud();_pause();_gps();_chat();touch=Touch.new();root.add_child(touch);touch.action.connect(_touch_action);touch.visible=false
 toast=Label.new();toast.position=Vector2(420,85);toast.size=Vector2(690,50);toast.horizontal_alignment=HORIZONTAL_ALIGNMENT_CENTER;toast.add_theme_font_size_override("font_size",18);toast.modulate=Color("d9eec8");root.add_child(toast)
func _panel(pos,minimum=Vector2(350,0)):
 var p=PanelContainer.new();p.position=pos;p.custom_minimum_size=minimum;root.add_child(p);return p
func _label(parent,text,size=16,color=Color("c9dae0")):
 var l=Label.new();l.text=text;l.add_theme_font_size_override("font_size",size);l.modulate=color;l.autowrap_mode=TextServer.AUTOWRAP_WORD_SMART;parent.add_child(l);return l
func _button(parent,text,call):
 var b=Button.new();b.text=text;b.focus_mode=Control.FOCUS_NONE;b.pressed.connect(call);parent.add_child(b);return b
func _menu():
 menu=_panel(Vector2(30,22),Vector2(380,0));var scroll=ScrollContainer.new();scroll.custom_minimum_size=Vector2(345,630);scroll.horizontal_scroll_mode=ScrollContainer.SCROLL_MODE_DISABLED;menu.add_child(scroll);var v=VBoxContainer.new();v.size_flags_horizontal=Control.SIZE_EXPAND_FILL;v.add_theme_constant_override("separation",10);scroll.add_child(v)
 _label(v,"VEYRA",58,Color("e9eddf"));_label(v,"N E O N   D I S T R I C T",15,Color("8ac6be"));_label(v,"NATIVE ALPHA 0.4",12,Color("b8d49c"))
 _label(v,"Real native renderer · Jolt ragdoll · spatial audio",12)
 _label(v,"NAMA WARGA",11);name_input=LineEdit.new();name_input.max_length=16;name_input.text=str(app.prefs.data.nickname);name_input.placeholder_text="Nama panggilan";v.add_child(name_input)
 var grid=GridContainer.new();grid.columns=3;v.add_child(grid)
 var names=["Raka","Kai","Atlas","Naya","Luna","Asha"]
 for i in range(6):
  var id=i;_button(grid,names[i],func():app.set_look(id))
 _label(v,"Dua base manusia berkulit/rig asli, 20 klip animasi retargeted, dan outfit berbobot. Native port bertahap; web tetap tersedia.",11,Color("83a0ad"))
 var online_button=_button(v,"MASUK ONLINE →",func():app.start_game(true));online_button.modulate=Color("cce9b6")
 _button(v,"LATIHAN OFFLINE · full native physics",func():app.start_game(false))
 var q=OptionButton.new();q.add_item("AUTO · menyesuaikan perangkat");q.add_item("LOW · RAM 2–3 GB");q.add_item("BALANCED · RAM 4 GB");q.add_item("HIGH · RAM 6–8 GB+");q.select(int(app.prefs.data.quality)+1);q.item_selected.connect(func(i):app.set_quality(i-1));v.add_child(q)
 _label(v,"WASD gerak · Shift sprint · Space jump/rem\nF kendaraan · RMB bidik · LMB tembak\nK ragdoll latihan · G GPS · T chat · Esc menu",11)
 _label(v,"Online memakai server yang sama. Voice WebRTC, party/account login dan parity penuh belum ada di native alpha.",11,Color("c5a785"))
 _button(v,"Tentang / lisensi",show_credits)
func _hud():
 hud=Control.new();hud.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT);hud.mouse_filter=Control.MOUSE_FILTER_IGNORE;root.add_child(hud)
 var p=PanelContainer.new();p.position=Vector2(16,16);p.custom_minimum_size=Vector2(255,0);hud.add_child(p);var v=VBoxContainer.new();v.add_theme_constant_override("separation",8);p.add_child(v)
 status_label=_label(v,"OFFLINE · NATIVE PHYSICS",12,Color("b7d8aa"));stats_label=_label(v,"",14)
 hp_bar=ProgressBar.new();hp_bar.custom_minimum_size=Vector2(200,12);hp_bar.max_value=100;hp_bar.show_percentage=false;v.add_child(hp_bar)
 stamina_bar=ProgressBar.new();stamina_bar.custom_minimum_size=Vector2(200,7);stamina_bar.max_value=100;stamina_bar.show_percentage=false;v.add_child(stamina_bar)
 prompt=Button.new();prompt.text="F · kendaraan";prompt.position=Vector2(410,625);prompt.custom_minimum_size=Vector2(440,45);prompt.focus_mode=Control.FOCUS_NONE;prompt.pressed.connect(func():app.interact());hud.add_child(prompt)
 gps_title=_label(hud,"",17,Color("b8e8d4"));gps_title.position=Vector2(430,20);gps_title.size=Vector2(620,40);gps_title.horizontal_alignment=HORIZONTAL_ALIGNMENT_CENTER
 crosshair=_label(hud,"＋",26,Color("f4ead4"));crosshair.set_anchors_and_offsets_preset(Control.PRESET_CENTER);crosshair.position=Vector2(628,343)
 hud.visible=false
func _pause():
 pause_panel=_panel(Vector2(440,140),Vector2(390,0));var v=VBoxContainer.new();v.add_theme_constant_override("separation",10);pause_panel.add_child(v)
 _label(v,"DISTRICT MENU",26);_button(v,"Lanjut bermain",func():app.toggle_pause());_button(v,"GPS / tujuan",func():show_gps());_button(v,"Reset kendaraan terbalik",func():app.reset_car());_button(v,"Kembali ke lobby",func():app.return_lobby())
 _label(v,"Volume",12);var slider=HSlider.new();slider.min_value=0;slider.max_value=1;slider.step=.02;slider.value=float(app.prefs.data.master);slider.value_changed.connect(func(x):app.prefs.data.master=x;app.audio_node.set_volume(x);app.prefs.save());v.add_child(slider)
 _button(v,"Buka versi web / voice",func():OS.shell_open("https://veyra-neon-district.dikanjut.workers.dev/"));_button(v,"Keluar aplikasi",func():app.get_tree().quit());pause_panel.visible=false
func _gps():
 gps_panel=_panel(Vector2(420,80),Vector2(430,0));var v=VBoxContainer.new();gps_panel.add_child(v);_label(v,"DISTRICT GPS",25)
 var scroll=ScrollContainer.new();scroll.custom_minimum_size=Vector2(380,420);v.add_child(scroll);var list=VBoxContainer.new();list.size_flags_horizontal=Control.SIZE_EXPAND_FILL;scroll.add_child(list)
 for p in app.world.data.map.pois:
  var point=p;_button(list,str(p.name),func():app.navigate_to(point);gps_panel.visible=false;app.paused=false)
 _button(v,"Tutup",func():gps_panel.visible=false;app.paused=false);gps_panel.visible=false
func _chat():
 chat_panel=_panel(Vector2(16,460),Vector2(380,200));var v=VBoxContainer.new();chat_panel.add_child(v)
 chat_log=RichTextLabel.new();chat_log.bbcode_enabled=false;chat_log.custom_minimum_size=Vector2(340,110);chat_log.scroll_following=true;v.add_child(chat_log)
 chat_input=LineEdit.new();chat_input.max_length=200;chat_input.placeholder_text="Pesan · Enter untuk kirim";chat_input.text_submitted.connect(func(text):app.send_chat(text);chat_input.clear();chat_input.release_focus());v.add_child(chat_input);chat_panel.visible=false
func show_menu():
 menu.visible=true;hud.visible=false;touch.visible=false;pause_panel.visible=false;gps_panel.visible=false;chat_panel.visible=false;Input.mouse_mode=Input.MOUSE_MODE_VISIBLE
func show_game():
 menu.visible=false;hud.visible=true;touch.visible=touch.enabled;chat_panel.visible=false
func show_gps():
 gps_panel.visible=true;pause_panel.visible=false;app.paused=true;Input.mouse_mode=Input.MOUSE_MODE_VISIBLE
func open_chat():
 chat_panel.visible=true;chat_input.grab_focus();Input.mouse_mode=Input.MOUSE_MODE_VISIBLE
func message(text):
 if chat_log:chat_log.append_text(str(text).left(220)+"\n")
func notify(text,seconds=3.0):
 toast.text=str(text);toast_time=seconds
func update_hud():
 if not app.player:return
 var p=app.player;hp_bar.value=p.health;stamina_bar.value=p.stamina*100
 var mode="ONLINE · SHARED SERVER" if app.online else "OFFLINE · NATIVE PHYSICS"
 status_label.text=mode
 var vehicle=""
 if p.driving:vehicle="\n%s   %d km/h   HP %d"%[str(p.driving.definition.label),absf(p.driving.speed_mps)*3.6,p.driving.hp]
 stats_label.text="%s  ·  $%d%s\n%s · %d FPS"%[str(app.prefs.data.nickname),app.money,vehicle,str(app.quality_spec.name),Engine.get_frames_per_second()]
 prompt.visible=app.playing and (p.driving!=null or app.candidate!=null)
 if p.driving:prompt.text="F / TURUN · rem dulu" if absf(p.driving.speed_mps)>4.5 else "F / TURUN · keluar aman"
 elif app.candidate:prompt.text="F / NAIK · "+str(app.candidate.definition.label)
 touch.set_driving(p.driving!=null);crosshair.visible=bool(p.controls.aim) and p.driving==null
func _process(delta):
 if toast_time>0:toast_time-=delta
 elif toast:toast.text=""
func _touch_action(key,pressed):
 if not pressed:return
 if key=="action":app.interact()
 elif key=="menu":app.toggle_pause()
 elif key=="gps":show_gps()
 elif key=="chat":open_chat()
 elif key=="ragdoll":app.manual_ragdoll()
 elif key=="horn":app.horn()
func show_credits():
 var dialog=AcceptDialog.new();dialog.title="Veyra Native · Credits";dialog.min_size=Vector2i(640,460);var text=RichTextLabel.new();text.custom_minimum_size=Vector2(600,390);text.text="Veyra native client code and original audio: MIT.\nGodot Engine: MIT.\nQuaternius Universal Base Characters + Universal Animation Library Standard: CC0.\nKenney Car Kit: CC0; original Veyra bus: MIT.\n\nNo GTA / Rockstar assets. No WebView.\n\n"+Engine.get_license_text()+"\n\nBundled engine third-party copyrights:\n"+JSON.stringify(Engine.get_copyright_info(),"  ")+"\n\nLicense texts:\n"+JSON.stringify(Engine.get_license_info(),"  ");dialog.add_child(text);root.add_child(dialog);dialog.popup_centered();dialog.confirmed.connect(func():dialog.queue_free())
