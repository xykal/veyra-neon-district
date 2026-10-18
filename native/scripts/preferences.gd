extends RefCounted

const SAVE_PATH = "user://preferences.json"
const PRESETS = [
 {"name":"LOW · 2–3 GB","distance":70.0,"scale":0.7,"shadows":false,"ragdolls":1,"people":4,"fps":30,"lod":0.5},
 {"name":"BALANCED · 4 GB","distance":115.0,"scale":0.85,"shadows":true,"ragdolls":3,"people":8,"fps":60,"lod":1.0},
 {"name":"HIGH · 6–8 GB+","distance":180.0,"scale":1.0,"shadows":true,"ragdolls":6,"people":14,"fps":60,"lod":1.4}
]
var data = {"nickname":"Warga","token":"","tokens":{},"look":0,"quality":-1,"master":0.8,"sfx":0.85,"ambient":0.35,"server":"wss://veyra-neon-district.dikanjut.workers.dev/"}
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
func save():
 var f=FileAccess.open(SAVE_PATH,FileAccess.WRITE)
 if f:f.store_string(JSON.stringify(data))
func auto_tier():
 var ram=OS.get_memory_info().get("physical",0)/1073741824.0
 if ram>0 and ram<3.6:return 0
 if ram>=5.5:return 2
 return 1 if not OS.has_feature("mobile") else 0
func tier():
 return auto_tier() if int(data.quality)<0 else int(data.quality)
func appearance():
 var looks=[ [0,2,1,0,1,4,1,1,0,0,0], [1,1,2,1,0,1,3,0,0,0,0], [2,3,5,0,4,2,1,3,1,2,0], [3,2,3,1,3,6,0,0,2,0,1], [4,4,4,0,2,3,3,1,0,0,0], [5,1,1,3,1,8,0,4,3,1,0] ]
 return looks[int(data.look)]
