extends CanvasLayer
const LookStage=preload("res://scripts/ui_look_stage.gd")
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
var toast_panel:PanelContainer
var toast_time=0.0
var gps_title:Label
var crosshair:Label
var loading_view:Control
var loading_label:Label
var loading_bar:ProgressBar
var loading_pct:Label
var busy=false
var start_buttons=[]
var help_label:Label
var last_driving=false
var margins=Vector4(18,18,18,18)
var look_stage:Control
var vault_panel:PanelContainer
var vault_buttons=[]
var vault_names=[]
func setup(game):
 app=game;root=Control.new();root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT);root.mouse_filter=Control.MOUSE_FILTER_IGNORE;add_child(root)
 root.theme=_theme();_look_stage();_menu();_vault();_hud();_pause();_gps();_chat();_loading()
 touch=Touch.new();root.add_child(touch);touch.action.connect(_touch_action);touch.visible=false;touch.set_pad_scale(float(app.prefs.data.control_scale))
 toast_panel=_panel(Vector2(0,0),Vector2(0,0))
 toast_panel.visible=false
 var toast_wrap=HBoxContainer.new();toast_panel.add_child(toast_wrap)
 toast=_label(toast_wrap,"",14,Color("dff2e8"));toast.horizontal_alignment=HORIZONTAL_ALIGNMENT_CENTER;toast.mouse_filter=Control.MOUSE_FILTER_IGNORE
 toast.custom_minimum_size=Vector2(460,0);toast_wrap.custom_minimum_size=Vector2(460,0)
 toast_panel.mouse_filter=Control.MOUSE_FILTER_IGNORE
 root.resized.connect(_layout);_layout()
func _theme():
 var theme=Theme.new()
 var outfit=load("res://assets/fonts/Outfit-Bold.ttf")
 if outfit is FontFile:theme.default_font=outfit
 theme.default_font_size=15
 var panel=StyleBoxFlat.new();panel.bg_color=Color("0b1620f2");panel.border_color=Color("2e5b6355");panel.set_border_width_all(1);panel.set_corner_radius_all(18);panel.content_margin_left=22;panel.content_margin_right=22;panel.content_margin_top=20;panel.content_margin_bottom=20
 panel.shadow_color=Color(0,0,0,.5);panel.shadow_size=12
 theme.set_stylebox("panel","PanelContainer",panel)
 var normal=StyleBoxFlat.new();normal.bg_color=Color("132530");normal.border_color=Color("2f5a60");normal.set_border_width_all(1);normal.set_corner_radius_all(11);normal.content_margin_left=16;normal.content_margin_right=16;normal.content_margin_top=12;normal.content_margin_bottom=12
 theme.set_stylebox("normal","Button",normal)
 var hover=normal.duplicate();hover.bg_color=Color("1b3a42");hover.border_color=Color("6fe0b8");theme.set_stylebox("hover","Button",hover)
 var pressed=normal.duplicate();pressed.bg_color=Color("2b6f5c");pressed.border_color=Color("a7f0cf");theme.set_stylebox("pressed","Button",pressed)
 var disabled=normal.duplicate();disabled.bg_color=Color("101e26");disabled.border_color=Color("1c333a");theme.set_stylebox("disabled","Button",disabled)
 var focus=normal.duplicate();focus.border_color=Color("6fe0b8");theme.set_stylebox("focus","Button",focus)
 theme.set_stylebox("separator","HSeparator",_sep_style())
 return theme
func _sep_style():
 var line=StyleBoxFlat.new();line.bg_color=Color("2b4d5566");line.content_margin_top=5;line.content_margin_bottom=5
 return line
func _panel(pos,minimum=Vector2(350,0)):
 var p=PanelContainer.new();p.position=pos;p.custom_minimum_size=minimum;root.add_child(p);return p
func _label(parent,text,size=15,color=Color("c9d8db")):
 var l=Label.new();l.text=text;l.add_theme_font_size_override("font_size",size);l.modulate=color;l.autowrap_mode=TextServer.AUTOWRAP_WORD_SMART;l.mouse_filter=Control.MOUSE_FILTER_IGNORE;parent.add_child(l);return l
func _button(parent,text,callback,sfx="ui"):
 var b=Button.new();b.text=text;b.focus_mode=Control.FOCUS_NONE
 b.pressed.connect(func():
  if app and app.audio_node:app.audio_node.play_ui(sfx,-13.0)
  callback.call()
 )
 parent.add_child(b);return b
func _style_primary(b):
 var base=StyleBoxFlat.new();base.bg_color=Color("6fe0b8");base.set_corner_radius_all(12);base.content_margin_left=18;base.content_margin_right=18;base.content_margin_top=14;base.content_margin_bottom=14
 var hover=base.duplicate();hover.bg_color=Color("8ff0cc")
 var pressed=base.duplicate();pressed.bg_color=Color("4fc9a0")
 b.add_theme_stylebox_override("normal",base);b.add_theme_stylebox_override("hover",hover);b.add_theme_stylebox_override("pressed",pressed)
 b.add_theme_color_override("font_color",Color("0b1620"));b.add_theme_color_override("font_hover_color",Color("0b1620"));b.add_theme_color_override("font_pressed_color",Color("0b1620"))
func _look_stage():
 look_stage=LookStage.new();look_stage.owner_ui=self;look_stage.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT);look_stage.mouse_filter=Control.MOUSE_FILTER_IGNORE;root.add_child(look_stage)
func _vault():
 vault_panel=_panel(Vector2(430,64),Vector2(420,0))
 var v=VBoxContainer.new();v.add_theme_constant_override("separation",10);vault_panel.add_child(v)
 _label(v,"VAULT / SIMPAN LOOK",22,Color("e2f0e7"))
 _label(v,"Tiga slot tersimpan. Geser karakter di kanan untuk muter 360°.",11,Color("9fd3c2"))
 for i in range(3):
  var slot=i
  var row=HBoxContainer.new();row.add_theme_constant_override("separation",8);v.add_child(row)
  var apply=_button(row,"SLOT "+str(slot+1)+" · "+LOOK_NAMES[slot],func():app.apply_vault(slot));apply.size_flags_horizontal=Control.SIZE_EXPAND_FILL;vault_buttons.append(apply)
  _button(row,"SIMPAN",func():app.save_vault(slot))
 _button(v,"Tutup",func():vault_panel.visible=false)
 vault_panel.visible=false;refresh_vault()
func refresh_vault():
 for i in range(min(3,vault_buttons.size())):
  var look=0
  if app and app.prefs.data.vault_looks is Array and i<app.prefs.data.vault_looks.size():look=int(app.prefs.data.vault_looks[i])
  vault_buttons[i].text="SLOT "+str(i+1)+" · "+LOOK_NAMES[clampi(look,0,LOOK_NAMES.size()-1)]
const LOOK_NAMES=["Raka","Kai","Atlas","Naya","Luna","Asha"]
func _menu():
 menu=_panel(Vector2(28,24),Vector2(392,0));var scroll=ScrollContainer.new();scroll.custom_minimum_size=Vector2(348,648);scroll.horizontal_scroll_mode=ScrollContainer.SCROLL_MODE_DISABLED;menu.add_child(scroll);var v=VBoxContainer.new();v.size_flags_horizontal=Control.SIZE_EXPAND_FILL;v.add_theme_constant_override("separation",12);scroll.add_child(v)
 _label(v,"VEYRA",64,Color("eef5e8"))
 var accent=ColorRect.new();accent.color=Color("6fe0b8");accent.custom_minimum_size=Vector2(58,4);v.add_child(accent)
 _label(v,"M U L T I P L A Y E R   R O L E P L A Y",12,Color("6fe0b8"))
 _label(v,"NATIVE 0.5.3 ALPHA  ·  LOMBOK ISLAND",10,Color("7fa8a2"))
 _sep(v)
 _label(v,"I D E N T I T A S",9,Color("e8c88a"))
 _label(v,"Siapa lo hari ini?",21,Color("e2f0e7"))
 _label(v,"NAMA WARGA",9,Color("6fe0b8"))
 name_input=LineEdit.new();name_input.max_length=16;name_input.text=str(app.prefs.data.nickname);name_input.placeholder_text="Nama panggilan";name_input.custom_minimum_size=Vector2(0,40);v.add_child(name_input)
 _label(v,"P I L I H   L O O K",9,Color("e8c88a"))
 var grid=GridContainer.new();grid.columns=3;grid.add_theme_constant_override("h_separation",8);grid.add_theme_constant_override("v_separation",8);v.add_child(grid)
 for i in range(6):
  var id=i;var chip=_button(grid,["RAKA","KAI","ATLAS","NAYA","LUNA","ASHA"][i],func():app.set_look(id));chip.custom_minimum_size=Vector2(0,38)
 _sep(v)
 _label(v,"M A S U K   D U N I A",9,Color("e8c88a"))
 var online=_button(v,"▶  MASUK DISTRIK ONLINE",func():app.start_game(true),"ui_confirm")
 _style_primary(online);online.custom_minimum_size=Vector2(0,54);start_buttons.append(online)
 var offline=_button(v,"PROVING GROUND  ·  OFFLINE",func():app.start_game(false),"ui_confirm")
 offline.custom_minimum_size=Vector2(0,44);start_buttons.append(offline)
 _button(v,"VAULT  ·  SIMPAN / PAKAI LOOK",func():vault_panel.visible=not vault_panel.visible)
 _label(v,"Geser karakter di kanan untuk muter 360°.",10,Color("7fa8a2"))
 _sep(v)
 _label(v,"KUALITAS GRAFIS",9,Color("6fe0b8"))
 var q=_quality_selector();v.add_child(q)
 _label(v,"Optimasi anti-crash tetap aktif: render bertahap, mobil dekat saja, dan quality AUTO aman untuk RAM kecil.",10,Color("7fa8a2"))
 _label(v,"WASD gerak · Shift lari · F kendaraan\nMouse kamera · RMB bidik · G GPS · Esc menu",10,Color("9fc4bd"))
 _button(v,"Diagnostik / salin laporan",func():app.copy_diagnostics());_button(v,"Tentang / lisensi",show_credits)
 _label(v,"Online masih server planar. Peta Lombok penuh menyusul; shell pulau sudah aktif.",9,Color("8c9a86"))
func _sep(parent):
 var h=HSeparator.new();parent.add_child(h)
func _quality_selector():
 var q=OptionButton.new();q.add_item("AUTO · mulai aman");q.add_item("SAFE · hemat GPU");q.add_item("BALANCED");q.add_item("HIGH · pilih manual");q.select(int(app.prefs.data.quality)+1);q.item_selected.connect(func(i):app.set_quality(i-1));return q
func _hud():
 hud=Control.new();hud.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT);hud.mouse_filter=Control.MOUSE_FILTER_IGNORE;root.add_child(hud)
 hud_canvas=Hud.new();hud_canvas.app=app;hud.add_child(hud_canvas)
 radar=Radar.new();radar.app=app;hud.add_child(radar)
 status_label=_label(hud,"VEYRA / OFFLINE",11,Color("b0cebe"))
 stats_label=_label(hud,"",10,Color("7796a4"));stats_label.visible=false
 prompt=Button.new();prompt.focus_mode=Control.FOCUS_NONE;prompt.add_theme_font_size_override("font_size",13)
 var pill=StyleBoxFlat.new();pill.bg_color=Color("0b1620e6");pill.border_color=Color("6fe0b866");pill.set_border_width_all(1);pill.set_corner_radius_all(20);pill.content_margin_left=18;pill.content_margin_right=18;pill.content_margin_top=8;pill.content_margin_bottom=8
 prompt.add_theme_stylebox_override("normal",pill)
 var pill_h=pill.duplicate();pill_h.border_color=Color("6fe0b8");prompt.add_theme_stylebox_override("hover",pill_h)
 prompt.add_theme_stylebox_override("pressed",pill_h)
 prompt.pressed.connect(func():app.interact());hud.add_child(prompt)
 gps_title=_label(hud,"",12,Color("c3dacf"));gps_title.horizontal_alignment=HORIZONTAL_ALIGNMENT_CENTER
 crosshair=_label(hud,"＋",23,Color("f0e3c7"));crosshair.horizontal_alignment=HORIZONTAL_ALIGNMENT_CENTER
 help_label=_label(hud,"WASD / GERAK      F / KENDARAAN      G / GPS      ESC / MENU",9,Color("7d958c"));help_label.horizontal_alignment=HORIZONTAL_ALIGNMENT_CENTER
 hud.visible=false
func _pause():
 pause_panel=_panel(Vector2(430,100),Vector2(415,0));var scroll=ScrollContainer.new();scroll.custom_minimum_size=Vector2(371,548);scroll.horizontal_scroll_mode=ScrollContainer.SCROLL_MODE_DISABLED;pause_panel.add_child(scroll);var v=VBoxContainer.new();v.size_flags_horizontal=Control.SIZE_EXPAND_FILL;v.add_theme_constant_override("separation",9);scroll.add_child(v)
 _label(v,"DISTRICT / PAUSE",23);_button(v,"Lanjut bermain",func():app.toggle_pause());_button(v,"GPS / tujuan",show_gps);_button(v,"Tegakkan kendaraan",func():app.reset_car());_button(v,"Uji ragdoll · offline",func():app.manual_ragdoll())
 v.add_child(_quality_selector());_label(v,"VOLUME",10)
 var volume=HSlider.new();volume.min_value=0;volume.max_value=1;volume.step=.02;volume.value=float(app.prefs.data.master);volume.value_changed.connect(func(x):app.prefs.data.master=x;app.audio_node.set_volume(x);app.prefs.save());v.add_child(volume)
 _label(v,"UKURAN TOMBOL SENTUH",10)
 var pad_scale=HSlider.new();pad_scale.min_value=.85;pad_scale.max_value=1.45;pad_scale.step=.05;pad_scale.value=float(app.prefs.data.control_scale);pad_scale.value_changed.connect(func(x):
  app.prefs.data.control_scale=x;app.prefs.save()
  if touch:touch.set_pad_scale(x)
 );v.add_child(pad_scale)
 _label(v,"SENSITIVITAS KAMERA",10);var look=HSlider.new();look.min_value=.45;look.max_value=1.8;look.step=.05;look.value=float(app.prefs.data.look_sensitivity);look.value_changed.connect(func(x):app.prefs.data.look_sensitivity=x;app.prefs.save());v.add_child(look)
 _button(v,"Salin diagnostik aman",func():app.copy_diagnostics());_button(v,"Kembali ke lobby",func():app.return_lobby());_button(v,"Keluar",func():app.get_tree().quit());pause_panel.visible=false
func _gps():
 gps_panel=_panel(Vector2(420,65),Vector2(440,0));var v=VBoxContainer.new();gps_panel.add_child(v);_label(v,"DISTRICT GPS",24)
 var scroll=ScrollContainer.new();scroll.custom_minimum_size=Vector2(385,405);v.add_child(scroll);var list=VBoxContainer.new();list.size_flags_horizontal=Control.SIZE_EXPAND_FILL;scroll.add_child(list)
 for p in app.world.data.map.pois:
  var point=p;_button(list,str(p.name),func():app.navigate_to(point);gps_panel.visible=false;app.paused=false;touch.visible=touch.enabled)
 _button(v,"Tutup",func():gps_panel.visible=false;app.paused=false;touch.visible=touch.enabled,"ui_back");gps_panel.visible=false
func _chat():
 chat_panel=_panel(Vector2(18,390),Vector2(370,200));var v=VBoxContainer.new();chat_panel.add_child(v)
 chat_log=RichTextLabel.new();chat_log.bbcode_enabled=false;chat_log.custom_minimum_size=Vector2(330,120);chat_log.scroll_following=true;chat_log.add_theme_font_size_override("normal_font_size",12);v.add_child(chat_log)
 chat_input=LineEdit.new();chat_input.max_length=200;chat_input.placeholder_text="Pesan / Enter";chat_input.text_submitted.connect(func(text):app.send_chat(text);chat_input.clear();chat_input.release_focus();chat_panel.visible=false;touch.visible=touch.enabled and not app.paused);v.add_child(chat_input);chat_panel.visible=false
func _loading():
 loading_view=Control.new();loading_view.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT);loading_view.mouse_filter=Control.MOUSE_FILTER_STOP;loading_view.visible=false;root.add_child(loading_view)
 var art=TextureRect.new();art.texture=load("res://assets/boot_splash.png");art.expand_mode=TextureRect.EXPAND_IGNORE_SIZE;art.stretch_mode=TextureRect.STRETCH_KEEP_ASPECT_COVERED;art.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT);loading_view.add_child(art)
 var shade=ColorRect.new();shade.color=Color("02060b9e");shade.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT);loading_view.add_child(shade)
 var stack=VBoxContainer.new();stack.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT);stack.alignment=BoxContainer.ALIGNMENT_CENTER;stack.add_theme_constant_override("separation",14);loading_view.add_child(stack)
 var t1=_label(stack,"VEYRA",58,Color("eef5e8"));t1.horizontal_alignment=HORIZONTAL_ALIGNMENT_CENTER
 var t2=_label(stack,"N E O N   D I S T R I C T",13,Color("6fe0b8"));t2.horizontal_alignment=HORIZONTAL_ALIGNMENT_CENTER
 loading_label=_label(stack,"Menyiapkan distrik…",13,Color("c4ddd8"));loading_label.horizontal_alignment=HORIZONTAL_ALIGNMENT_CENTER
 var bar_wrap=VBoxContainer.new();bar_wrap.custom_minimum_size=Vector2(440,0);bar_wrap.size_flags_horizontal=Control.SIZE_SHRINK_CENTER;stack.add_child(bar_wrap)
 loading_bar=ProgressBar.new();loading_bar.max_value=1;loading_bar.show_percentage=false;loading_bar.custom_minimum_size=Vector2(440,10)
 var fill=StyleBoxFlat.new();fill.bg_color=Color("6fe0b8");fill.set_corner_radius_all(5);loading_bar.add_theme_stylebox_override("fill",fill)
 var bg=StyleBoxFlat.new();bg.bg_color=Color("09141ce6");bg.set_corner_radius_all(5);loading_bar.add_theme_stylebox_override("background",bg);bar_wrap.add_child(loading_bar)
 loading_pct=_label(stack,"0%",11,Color("8fe8c4"));loading_pct.horizontal_alignment=HORIZONTAL_ALIGNMENT_CENTER
 var tip=_label(stack,"Tips: tekan F buat masuk kendaraan, G buat GPS.",10,Color("9fc4bd"));tip.horizontal_alignment=HORIZONTAL_ALIGNMENT_CENTER
func set_loading(value,progress,text):
 busy=value;loading_view.visible=value;loading_bar.value=progress;loading_label.text=text
 if loading_pct:loading_pct.text=str(int(progress*100.0))+"%"
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
 if toast_panel and toast_panel.visible:toast_panel.position=Vector2(view.x*.5-toast_panel.size.x*.5,maxf(58,view.y*.07))
func show_menu():
 menu.visible=true
 if look_stage:look_stage.mouse_filter=Control.MOUSE_FILTER_STOP;look_stage.visible=true
 hud.visible=false;touch.visible=false;pause_panel.visible=false;gps_panel.visible=false;chat_panel.visible=false;Input.mouse_mode=Input.MOUSE_MODE_VISIBLE
func show_game():
 menu.visible=false
 if look_stage:look_stage.mouse_filter=Control.MOUSE_FILTER_IGNORE;look_stage.visible=false
 if vault_panel:vault_panel.visible=false
 hud.visible=true;touch.visible=touch.enabled;chat_panel.visible=false;_layout()
func show_gps():
 gps_panel.visible=true;pause_panel.visible=false;app.paused=true;touch.reset();touch.visible=false;Input.mouse_mode=Input.MOUSE_MODE_VISIBLE
func open_chat():
 chat_panel.visible=true;touch.reset();touch.visible=false;chat_input.grab_focus();Input.mouse_mode=Input.MOUSE_MODE_VISIBLE
func message(text):
 if chat_log:
  if chat_log.get_line_count()>70:chat_log.clear()
  chat_log.append_text(str(text).left(220)+"\n")
func notify(text,seconds=3.0):
 toast.text=str(text);toast_time=seconds
 if toast_panel:toast_panel.visible=true;toast_panel.reset_size();toast_panel.position=Vector2(root.size.x*.5-toast_panel.size.x*.5,maxf(58,root.size.y*.07))
func update_hud():
 if not app.player:return
 var driving=app.player.driving!=null;status_label.text="VEYRA / "+("ONLINE" if app.online else "PROVING GROUND")
 prompt.visible=app.playing and (driving or app.candidate!=null)
 if driving:prompt.text="F  ·  REM UNTUK TURUN" if absf(app.player.driving.speed_mps)>4.5 else "F  ·  TURUN KENDARAAN"
 elif app.candidate:prompt.text="F  ·  MASUK "+str(app.candidate.definition.label).to_upper()
 touch.set_driving(driving);crosshair.visible=bool(app.player.controls.aim) and not driving
 if driving!=last_driving:last_driving=driving;_layout()
func _process(delta):
 if toast_time>0:toast_time-=delta
 elif toast:
  toast.text=""
  if toast_panel:toast_panel.visible=false
func _touch_action(key,pressed):
 if not pressed:return
 if key=="action":app.interact()
 elif key=="menu":app.toggle_pause();touch.visible=touch.enabled and not app.paused
 elif key=="gps":show_gps()
 elif key=="chat":open_chat()
 elif key=="horn":app.horn()
func show_credits():
 var dialog=AcceptDialog.new();dialog.title="Veyra / Credits";dialog.min_size=Vector2i(640,460);var text=RichTextLabel.new();text.custom_minimum_size=Vector2(600,390);text.text="Veyra code/audio: MIT. Godot: MIT. Quaternius human models/animations: CC0. Kenney vehicles: CC0. No GTA assets.\n\n"+Engine.get_license_text()+"\n"+JSON.stringify(Engine.get_copyright_info(),"  ")+"\n"+JSON.stringify(Engine.get_license_info(),"  ");dialog.add_child(text);root.add_child(dialog);dialog.popup_centered();dialog.confirmed.connect(func():dialog.queue_free())
