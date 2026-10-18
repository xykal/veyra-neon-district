extends SceneTree
# Two actual Godot WebSocketPeer clients, not browser stubs. No real profile files are touched.
class Session:
 extends RefCounted
 var data={}
 var saves=0
 func _init(nick,url):data={"nickname":nick,"token":"","server":url}
 func appearance():return [0,2,1,0,1,4,1,1,0,0,0]
 func save():saves+=1
var failures=0
var checks=0
var snapshots=[null,null]
var chat_received=false
func check(value,label):
 checks+=1
 if not value:failures+=1;push_error("NETWORK_ASSERT "+label)
func _initialize():call_deferred("run")
func receive(index,message):
 if message.get("t")=="s":snapshots[index]=message
 if index==1 and message.get("t")=="chat" and message.get("m")=="native-pair-check":chat_received=true
func run():
 var url=OS.get_environment("VEYRA_TEST_SERVER")
 if url=="":url="wss://veyra-neon-district.dikanjut.workers.dev/"
 var Net=load("res://scripts/network.gd");var sa=Session.new("NativeQA_A",url);var sb=Session.new("NativeQA_B",url)
 var a=Net.new();var b=Net.new();root.add_child(a);root.add_child(b);a.setup(sa);b.setup(sb);a.packet.connect(func(m):receive(0,m));b.packet.connect(func(m):receive(1,m));a.join();b.join()
 var deadline=Time.get_ticks_msec()+20000
 while Time.get_ticks_msec()<deadline:
  await process_frame
  if a.welcomed and b.welcomed and snapshots[0]!=null and snapshots[1]!=null:break
 check(a.welcomed and b.welcomed,"both native peers welcomed")
 check(a.my_id!=b.my_id and a.my_id>0,"different authoritative player IDs")
 check(str(sa.data.token).length()==64 and str(sb.data.token).length()==64 and sa.data.token!=sb.data.token,"separate opaque saved identities")
 if not a.welcomed or not b.welcomed:a.leave();b.leave();quit(1);return
 await create_timer(.5).timeout
 a.send({"t":"chat","m":"native-pair-check"});a.input({"mx":1.0,"my":0.0,"sprint":false})
 deadline=Time.get_ticks_msec()+5000
 while Time.get_ticks_msec()<deadline and not chat_received:await process_frame
 check(chat_received,"chat broadcast reaches other native peer")
 check(snapshots[0]!=null and snapshots[1]!=null,"server snapshots reach both peers")
 check(snapshots[0].p.any(func(p):return int(p.i)==b.my_id),"both clients share the same city")
 a.leave();b.leave();await create_timer(.12).timeout
 print("NATIVE_NETWORK_","PASS" if failures==0 else "FAIL"," checks=",checks," ids=",a.my_id,",",b.my_id," no raw tokens logged")
 quit(0 if failures==0 else 1)
