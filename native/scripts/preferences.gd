extends RefCounted

const SAVE_PATH = "user://preferences.json"
const PRESETS = [
 {"name":"SAFE · hemat GPU","distance":65.0,"scale":0.7,"shadows":false,"ragdolls":1,"people":2,"vehicles":12,"remote":6,"fps":30,"lod":0.6},
 {"name":"BALANCED","distance":100.0,"scale":0.85,"shadows":true,"ragdolls":2,"people":4,"vehicles":24,"remote":10,"fps":60,"lod":1.0},
 {"name":"HIGH · manual","distance":150.0,"scale":1.0,"shadows":true,"ragdolls":3,"people":8,"vehicles":40,"remote":16,"fps":60,"lod":1.3}
]
var data = {"nickname":"Warga","token":"","tokens":{},"look":0,"quality":-1,"master":0.8,"sfx":0.85,"ambient":0.35,"perf_revision":0,"look_sensitivity":1.0,"control_scale":1.08,"aim_response":1.25,"vault_looks":[0,1,2],"server":"wss://veyra-neon-district.dikanjut.workers.dev/"}
func _init():
 if FileAccess.file_exists(SAVE_PATH):
  var f=FileAccess.open(SAVE_PATH,FileAccess.READ)
  if f and f.get_length()<32768:
   var value=JSON.parse_string(f.get_as_text())
   if value is Dictionary:
    for k in data:
     if value.has(k):data[k]=value[k]
 data.nickname=str(data.nickname).left(16)
 if not str(data.token).is_valid_hex_number() or str(data.token).length()!=64:data.token=""
 data.look=clampi(int(data.look),0,5)
 data.quality=clampi(int(data.quality),-1,2)
 if int(data.perf_revision)<1 and OS.has_feature("mobile"):data.quality=-1
 data.perf_revision=1
 data.look_sensitivity=clampf(float(data.look_sensitivity),.45,1.8)
 data.control_scale=clampf(float(data.control_scale),.85,1.45)
 data.aim_response=clampf(float(data.aim_response),.8,1.8)
 if not data.vault_looks is Array or data.vault_looks.size()!=3:data.vault_looks=[0,1,2]
 for i in range(data.vault_looks.size()):data.vault_looks[i]=clampi(int(data.vault_looks[i]),0,5)
 if not data.tokens is Dictionary:data.tokens={}
 data.master=clampf(float(data.master),0,1)
func save():
 var f=FileAccess.open(SAVE_PATH,FileAccess.WRITE)
 if f:f.store_string(JSON.stringify(data))
func auto_tier():
 # RAM is not GPU performance. Android always boots conservatively; High is explicit opt-in.
 var ram=OS.get_memory_info().get("physical",0)/1073741824.0
 if OS.has_feature("mobile") or (ram>0 and ram<3.8):return 0
 return 1
func tier():
 return auto_tier() if int(data.quality)<0 else int(data.quality)
func appearance():
 var looks=[ [0,2,1,0,1,4,1,1,0,0,0], [1,1,2,1,0,1,3,0,0,0,0], [2,3,5,0,4,2,1,3,1,2,0], [3,2,3,1,3,6,0,0,2,0,1], [4,4,4,0,2,3,3,1,0,0,0], [5,1,1,3,1,8,0,4,3,1,0] ]
 return looks[int(data.look)]
