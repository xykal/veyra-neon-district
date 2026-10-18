extends CanvasLayer
const Touch=preload("res://scripts/touch_controls.gd")
const Hud=preload("res://scripts/hud_canvas.gd")
const Radar=preload("res://scripts/radar.gd")
var app
var root:Control
var menu:PanelContainer
var hud:Control
var hud_canvas
var radar
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
var toast:Label
var toast_time=0.0
var gps_title:Label
var crosshair:Label
var loading_view:Control
var loading_label:Label
var loading_bar:ProgressBar
var busy=false
var start_buttons=[]
var help_label:Label
var last_driving=false
var margins=Vector4(18,18,18,18)
func setup(game):
 app=game;root=Control.new();root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT);root.mouse_filter=Control.MOUSE_FILTER_IGNORE;add_child(root)
 root.theme=_theme();_menu();_hud();_pause();_gps();_chat();_loading()
 touch=Touch.new();root.add_child(touch);touch.action.connect(_touch_action);touch.visible=false
 toast=_label(root,"",14,Color("c5dfd1"));toast.horizontal_alignment=HORIZONTAL_ALIGNMENT_CENTER;toast.mouse_filter=Control.MOUSE_FILTER_IGNORE
 root.resized.connect(_layout);_layout()
func _theme():
 var theme=Theme.new();theme.default_font_size=15
 var panel=StyleBoxFlat.new();panel.bg_color=Color("0c1926f2");panel.border_color=Color("2b454d");panel.set_border_width_all(1);panel.set_corner_radius_all(14);panel.content_margin_left=22;panel.content_margin_right=22;panel.content_margin_top=20;panel.content_margin_bottom=20;theme.set_stylebox("panel","PanelContainer",panel)
 var normal=StyleBoxFlat.new();normal.bg_color=Color("17303b");normal.border_color=Color("35545c");normal.set_border_width_all(1);normal.set_corner_radius_all(7);normal.content_margin_left=14;normal.content_margin_right=14;normal.content_margin_top=11;normal.content_margin_bottom=11;theme.set_stylebox("normal","Button",normal)
 var hover=normal.duplicate();hover.bg_color=Color("294b50");hover.border_color=Color("84b9a9");theme.set_stylebox("hover","Button",hover)
 var pressed=normal.duplicate();pressed.bg_color=Color("396454");theme.set_stylebox("pressed","Button",pressed)
 return theme
func _panel(pos,minimum=Vector2(350,0)):
 var p=PanelContainer.new();p.position=pos;p.custom_minimum_size=minimum;root.add_child(p);return p
func _label(parent,text,size=15,color=Color("c9d8db")):
 var l=Label.new();l.text=text;l.add_theme_font_size_override("font_size",size);l.modulate=color;l.autowrap_mode=TextServer.AUTOWRAP_WORD_SMART;l.mouse_filter=Control.MOUSE_FILTER_IGNORE;parent.add_child(l);return l
func _button(parent,text,callback):
 var b=Button.new();b.text=text;b.focus_mode=Control.FOCUS_NONE;b.pressed.connect(callback);parent.add_child(b);return b
func _menu():
 menu=_panel(Vector2(26,22),Vector2(378,0));var scroll=ScrollContainer.new();scroll.custom_minimum_size=Vector2(334,620);scroll.horizontal_scroll_mode=ScrollContainer.SCROLL_MODE_DISABLED;menu.add_child(scroll);var v=VBoxContainer.new();v.size_flags_horizontal=Control.SIZE_EXPAND_FILL;v.add_theme_constant_override("separation",11);scroll.add_child(v)
 _label(v,"VEYRA",56,Color("e5ebdd"));_label(v,"N E O N   D I S T R I C T",14,Color("82b9aa"));_label(v,"NATIVE 0.4.1 / PERFORMANCE EDITION",10,Color("8ba8b1"))
 _label(v,"Identitas lo. Distrik lo.",18,Color("d1dfd6"));_label(v,"NAMA WARGA",10)
 name_input=LineEdit.new();name_input.max_length=16;name_input.text=str(app.prefs.data.nickname);name_input.placeholder_text="Nama panggilan";v.add_child(name_input)
 var grid=GridContainer.new();grid.columns=3;v.add_child(grid)
 for i in range(6):
  var id=i;_button(grid,["Raka","Kai","Atlas","Naya","Luna","Asha"][i],func():app.set_look(id))
 var online=_button(v,"MASUK DISTRIK ONLINE  →",func():app.start_game(true));online.modulate=Color("c2e0b1");start_buttons.append(online)
 start_buttons.append(_button(v,"PROVING GROUND · offline",func():app.start_game(false)))
 var q=_quality_selector();v.add_child(q)
 _label(v,"Aman untuk mulai: tanpa shadow, render bertahap, mobil dekat saja. Model karakter tetap ber-rig asli.",11,Color("7895a2"))
 _label(v,"WASD gerak · Shift lari · F kendaraan\nMouse kamera · RMB bidik · G GPS · Esc menu",11)
 _button(v,"Diagnostik / salin laporan",func():app.copy_diagnostics());_button(v,"Tentang / lisensi",show_credits)
 _label(v,"Native alpha: online masih server planar. Voice dan parity wardrobe belum penuh.",10,Color("a89f85"))
func _quality_selector():
 var q=OptionButton.new();q.add_item("AUTO · mulai aman");q.add_item("SAFE · hemat GPU");q.add_item("BALANCED");q.add_item("HIGH · pilih manual");q.select(int(app.prefs.data.quality)+1);q.item_selected.connect(func(i):app.set_quality(i-1));return q
func _hud():
 hud=Control.new();hud.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT);hud.mouse_filter=Control.MOUSE_FILTER_IGNORE;root.add_child(hud)
 hud_canvas=Hud.new();hud_canvas.app=app;hud.add_child(hud_canvas)
 radar=Radar.new();radar.app=app;hud.add_child(radar)
 status_label=_label(hud,"NEON DISTRICT / OFFLINE",11,Color("b0cebe"))
 stats_label=_label(hud,"",10,Color("7796a4"));stats_label.visible=false
 prompt=Button.new();prompt.focus_mode=Control.FOCUS_NONE;prompt.add_theme_font_size_override("font_size",12);prompt.pressed.connect(func():app.interact());hud.add_child(prompt)
 gps_title=_label(hud,"",12,Color("c3dacf"));gps_title.horizontal_alignment=HORIZONTAL_ALIGNMENT_CENTER
 crosshair=_label(hud,"＋",23,Color("f0e3c7"));crosshair.horizontal_alignment=HORIZONTAL_ALIGNMENT_CENTER
 help_label=_label(hud,"WASD / GERAK      F / KENDARAAN      G / GPS      ESC / MENU",9,Color("809da7"));help_label.horizontal_alignment=HORIZONTAL_ALIGNMENT_CENTER
 hud.visible=false
func _pause():
 pause_panel=_panel(Vector2(430,100),Vector2(415,0));var scroll=ScrollContainer.new();scroll.custom_minimum_size=Vector2(371,548);scroll.horizontal_scroll_mode=ScrollContainer.SCROLL_MODE_DISABLED;pause_panel.add_child(scroll);var v=VBoxContainer.new();v.size_flags_horizontal=Control.SIZE_EXPAND_FILL;v.add_theme_constant_override("separation",9);scroll.add_child(v)
 _label(v,"DISTRICT / PAUSE",23);_button(v,"Lanjut bermain",func():app.toggle_pause());_button(v,"GPS / tujuan",show_gps);_button(v,"Tegakkan kendaraan",func():app.reset_car());_button(v,"Uji ragdoll · offline",func():app.manual_ragdoll())
 v.add_child(_quality_selector());_label(v,"VOLUME",10)
 var volume=HSlider.new();volume.min_value=0;volume.max_value=1;volume.step=.02;volume.value=float(app.prefs.data.master);volume.value_changed.connect(func(x):app.prefs.data.master=x;app.audio_node.set_volume(x);app.prefs.save());v.add_child(volume)
 _label(v,"SENSITIVITAS KAMERA",10);var look=HSlider.new();look.min_value=.45;look.max_value=1.8;look.step=.05;look.value=float(app.prefs.data.look_sensitivity);look.value_changed.connect(func(x):app.prefs.data.look_sensitivity=x;app.prefs.save());v.add_child(look)
 _button(v,"Salin diagnostik aman",func():app.copy_diagnostics());_button(v,"Kembali ke lobby",func():app.return_lobby());_button(v,"Keluar",func():app.get_tree().quit());pause_panel.visible=false
func _gps():
 gps_panel=_panel(Vector2(420,65),Vector2(440,0));var v=VBoxContainer.new();gps_panel.add_child(v);_label(v,"DISTRICT GPS",24)
 var scroll=ScrollContainer.new();scroll.custom_minimum_size=Vector2(385,405);v.add_child(scroll);var list=VBoxContainer.new();list.size_flags_horizontal=Control.SIZE_EXPAND_FILL;scroll.add_child(list)
 for p in app.world.data.map.pois:
  var point=p;_button(list,str(p.name),func():app.navigate_to(point);gps_panel.visible=false;app.paused=false;touch.visible=touch.enabled)
 _button(v,"Tutup",func():gps_panel.visible=false;app.paused=false;touch.visible=touch.enabled);gps_panel.visible=false
func _chat():
 chat_panel=_panel(Vector2(18,390),Vector2(370,200));var v=VBoxContainer.new();chat_panel.add_child(v)
 chat_log=RichTextLabel.new();chat_log.bbcode_enabled=false;chat_log.custom_minimum_size=Vector2(330,120);chat_log.scroll_following=true;chat_log.add_theme_font_size_override("normal_font_size",12);v.add_child(chat_log)
 chat_input=LineEdit.new();chat_input.max_length=200;chat_input.placeholder_text="Pesan / Enter";chat_input.text_submitted.connect(func(text):app.send_chat(text);chat_input.clear();chat_input.release_focus();chat_panel.visible=false;touch.visible=touch.enabled and not app.paused);v.add_child(chat_input);chat_panel.visible=false
func _loading():
 loading_view=Control.new();loading_view.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT);loading_view.mouse_filter=Control.MOUSE_FILTER_STOP;root.add_child(loading_view)
 var background=ColorRect.new();background.color=Color("07111f");background.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT);loading_view.add_child(background)
 var v=VBoxContainer.new();v.position=Vector2(390,280);v.custom_minimum_size=Vector2(500,0);v.add_theme_constant_override("separation",15);loading_view.add_child(v)
 _label(v,"VEYRA / DISTRICT LOADER",25,Color("d4e6d4"));loading_label=_label(v,"Menyiapkan distrik…",13,Color("8ba9b6"))
 loading_bar=ProgressBar.new();loading_bar.max_value=1;loading_bar.show_percentage=false;loading_bar.custom_minimum_size=Vector2(500,5)
 var fill=StyleBoxFlat.new();fill.bg_color=Color("a5d4b3");fill.set_corner_radius_all(3);loading_bar.add_theme_stylebox_override("fill",fill);v.add_child(loading_bar)
 _label(v,"Memuat bertahap. Jangan hapus data aplikasi untuk update.",10,Color("627f91"));loading_view.visible=false
func set_loading(value,progress,text):
 busy=value;loading_view.visible=value;loading_bar.value=progress;loading_label.text=text
 for b in start_buttons:b.disabled=value
 if value:touch.visible=false
func _layout():
 var view=root.size
 if view.x<1:return
 var left=18.0;var right=18.0;var bottom=18.0
 if OS.has_feature("mobile"):
  var safe=DisplayServer.get_display_safe_area();var window=DisplayServer.window_get_size();var ratio=view.x/maxf(1,window.x)
  left+=maxf(0,safe.position.x)*ratio;right+=maxf(0,window.x-safe.end.x)*ratio;bottom+=maxf(0,window.y-safe.end.y)*view.y/maxf(1,window.y)
 margins=Vector4(left,right,18,bottom)
 if touch:touch.set_insets(left-18,right-18,bottom-18)
 if hud_canvas:hud_canvas.insets=margins
 if loading_view and loading_view.get_child_count()>1:loading_view.get_child(1).position=Vector2(view.x*.5-250,view.y*.5-60)
 status_label.position=Vector2(left,22);status_label.size=Vector2(320,20)
 stats_label.position=Vector2(left,46);stats_label.size=Vector2(300,36)
 var mobile=touch.enabled if touch else OS.has_feature("mobile")
 radar.size=Vector2(154,120) if mobile else Vector2(174,132);radar.position=Vector2(left,view.y-(335 if mobile else 200)-bottom+18)
 prompt.position=Vector2(view.x*.5-154,view.y-(174 if app.player and app.player.driving else 68)-bottom+18);prompt.size=Vector2(308,39)
 gps_title.position=Vector2(view.x*.5-200,23);gps_title.size=Vector2(400,22)
 crosshair.position=view*.5-Vector2(14,16);crosshair.size=Vector2(28,32)
 help_label.position=Vector2(view.x*.5-260,view.y-22);help_label.size=Vector2(520,16);help_label.visible=not mobile
 pause_panel.position=Vector2(view.x*.5-208,maxf(24,view.y*.5-290));gps_panel.position=Vector2(view.x*.5-220,40)
 chat_panel.position=Vector2(left,maxf(110,view.y-390))
 if toast:toast.position=Vector2(view.x*.5-240,70);toast.size=Vector2(480,45)
func show_menu():
 menu.visible=true;hud.visible=false;touch.visible=false;pause_panel.visible=false;gps_panel.visible=false;chat_panel.visible=false;Input.mouse_mode=Input.MOUSE_MODE_VISIBLE
func show_game():
 menu.visible=false;hud.visible=true;touch.visible=touch.enabled;chat_panel.visible=false;_layout()
func show_gps():
 gps_panel.visible=true;pause_panel.visible=false;app.paused=true;touch.reset();touch.visible=false;Input.mouse_mode=Input.MOUSE_MODE_VISIBLE
func open_chat():
 chat_panel.visible=true;touch.reset();touch.visible=false;chat_input.grab_focus();Input.mouse_mode=Input.MOUSE_MODE_VISIBLE
func message(text):
 if chat_log:
  if chat_log.get_line_count()>70:chat_log.clear()
  chat_log.append_text(str(text).left(220)+"\n")
func notify(text,seconds=3.0):toast.text=str(text);toast_time=seconds
func update_hud():
 if not app.player:return
 var driving=app.player.driving!=null;status_label.text="NEON DISTRICT / "+("ONLINE" if app.online else "PROVING GROUND")
 prompt.visible=app.playing and (driving or app.candidate!=null)
 if driving:prompt.text="F  ·  REM UNTUK TURUN" if absf(app.player.driving.speed_mps)>4.5 else "F  ·  TURUN KENDARAAN"
 elif app.candidate:prompt.text="F  ·  MASUK "+str(app.candidate.definition.label).to_upper()
 touch.set_driving(driving);crosshair.visible=bool(app.player.controls.aim) and not driving
 if driving!=last_driving:last_driving=driving;_layout()
func _process(delta):
 if toast_time>0:toast_time-=delta
 elif toast:toast.text=""
func _touch_action(key,pressed):
 if not pressed:return
 if key=="action":app.interact()
 elif key=="menu":app.toggle_pause();touch.visible=touch.enabled and not app.paused
 elif key=="gps":show_gps()
 elif key=="chat":open_chat()
 elif key=="horn":app.horn()
func show_credits():
 var dialog=AcceptDialog.new();dialog.title="Veyra Native / Credits";dialog.min_size=Vector2i(640,460);var text=RichTextLabel.new();text.custom_minimum_size=Vector2(600,390);text.text="Veyra code/audio: MIT. Godot: MIT. Quaternius human models/animations: CC0. Kenney vehicles: CC0. No GTA assets.\n\n"+Engine.get_license_text()+"\n"+JSON.stringify(Engine.get_copyright_info(),"  ")+"\n"+JSON.stringify(Engine.get_license_info(),"  ");dialog.add_child(text);root.add_child(dialog);dialog.popup_centered();dialog.confirmed.connect(func():dialog.queue_free())
