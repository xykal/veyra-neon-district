extends Node

signal packet(message)
signal status_changed(text)
var peer=WebSocketPeer.new()
var prefs
var wanted=false
var connected=false
var welcomed=false
var retry=0.0
var attempts=0
var sequence=0
var my_id=0
var ping_ms=0
var elapsed=0.0
var ping_timer=0.0
var last_state=WebSocketPeer.STATE_CLOSED
func setup(preferences):
 prefs=preferences
 peer.inbound_buffer_size=262144;peer.outbound_buffer_size=131072;peer.max_queued_packets=64
func join():
 wanted=true;attempts=0;retry=0;_connect()
func _connect():
 if not wanted:return
 peer=WebSocketPeer.new();peer.inbound_buffer_size=262144;peer.outbound_buffer_size=131072;peer.max_queued_packets=64
 var url=str(prefs.data.server)
 if not (url.begins_with("wss://") or url.begins_with("ws://127.0.0.1:") or url.begins_with("ws://localhost:")):
  status_changed.emit("Server URL harus WSS, kecuali localhost untuk development.");wanted=false;return
 var error=peer.connect_to_url(url)
 if error!=OK:status_changed.emit("Tidak bisa menghubungkan ke server.");_schedule()
 else:status_changed.emit("Menghubungkan distrik online…")
 last_state=WebSocketPeer.STATE_CONNECTING
func leave():
 wanted=false;connected=false;welcomed=false;peer.close(1000,"Leaving district")
func _process(delta):
 elapsed+=delta
 if not wanted:return
 peer.poll();var state=peer.get_ready_state()
 if state==WebSocketPeer.STATE_OPEN:
  if not connected:
   connected=true;welcomed=false;sequence=0
   send({"t":"hello","n":str(prefs.data.nickname).left(16),"r":prefs.data.get("tokens",{}).get(str(prefs.data.server),prefs.data.token if str(prefs.data.server)=="wss://veyra-neon-district.dikanjut.workers.dev/" else ""),"o":prefs.appearance(),"v":"0.3.0","client":"native-0.4"})
  while peer.get_available_packet_count()>0:
   var bytes=peer.get_packet()
   if bytes.size()>65536:leave();status_changed.emit("Server packet terlalu besar.");return
   var value=JSON.parse_string(bytes.get_string_from_utf8())
   if not value is Dictionary:continue
   if value.get("t")=="welcome":
    welcomed=true;my_id=int(value.id);prefs.data.token=str(value.r);
    if not prefs.data.has("tokens"):prefs.data.tokens={}
    prefs.data.tokens[str(prefs.data.server)]=str(value.r);prefs.save();attempts=0;status_changed.emit("ONLINE · native renderer / shared server")
   elif value.get("t")=="pong":ping_ms=maxi(0,Time.get_ticks_msec()-int(value.ts))
   packet.emit(value)
  ping_timer+=delta
  if ping_timer>2 and welcomed:ping_timer=0;send({"t":"ping","ts":Time.get_ticks_msec()})
 elif state==WebSocketPeer.STATE_CLOSED:
  if last_state!=state:
   var code=peer.get_close_code();connected=false;welcomed=false
   if code==4001:wanted=false;status_changed.emit("Identitas ini dibuka di perangkat lain.")
   else:_schedule()
  retry-=delta
  if wanted and retry<=0:_connect()
 last_state=state
func _schedule():
 connected=false;welcomed=false;attempts+=1;retry=minf(8,1.0*pow(1.5,mini(attempts,6)));status_changed.emit("Koneksi terputus; mencoba lagi…")
func send(value):
 if peer.get_ready_state()!=WebSocketPeer.STATE_OPEN:return false
 if value.get("t")=="in" and peer.get_current_outbound_buffered_amount()>32768:return false
 peer.send_text(JSON.stringify(value));return true
func input(controls):
 sequence=(sequence+1)%2147483646;send({"t":"in","q":sequence,"i":controls})
