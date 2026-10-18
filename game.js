'use strict';
const $=s=>document.querySelector(s),canvas=$('#game'),ctx=canvas.getContext('2d'),W=1000,H=600,C=40,cols=25,rows=15;
// Transparent atlas derived from the user's eight pixel art objects.
const pixelAtlas=new Image();
pixelAtlas.src='assets/pixel-atlas.png';
const terrainAtlas=new Image();terrainAtlas.src='assets/terrain-atlas.png';
const walkAtlas=new Image();walkAtlas.src='assets/farmer-walk.png';
const characterAtlas=new Image();characterAtlas.src='assets/farm-characters.png';
const spriteRects={flag:[140,90,280,390],tree:[527,151,285,346],ladder:[951,141,190,355],crate:[122,570,266,248],house:[455,558,345,276],water:[865,609,316,225],bridge:[126,912,526,256],fence:[758,923,371,244]};
function sprite(name,x,y,w,h){if(!pixelAtlas.complete||!pixelAtlas.naturalWidth)return false;const r=spriteRects[name],sx=pixelAtlas.naturalWidth/1280,sy=pixelAtlas.naturalHeight/1280;ctx.imageSmoothingEnabled=false;ctx.drawImage(pixelAtlas,r[0]*sx,r[1]*sy,r[2]*sx,r[3]*sy,x,y,w,h);return true}

const crops={carrot:{name:'Cà rốt',icon:'🥕',cost:5,price:14,time:35},wheat:{name:'Lúa mì',icon:'🌾',cost:8,price:22,time:55},berry:{name:'Dâu tây',icon:'🍓',cost:15,price:40,time:85}};
const staffPool=[['Mai','🌻','Người làm vườn','R'],['An','👒','Người thu hoạch','R'],['Linh','🌸','Người làm vườn','SR'],['Bảo','🧑‍🌾','Người thu hoạch','SR'],['Mộc','🧝','Người làm vườn','SSR'],['Nắng','🧚','Người thu hoạch','SSR']];
const toolPool=[['Bình tưới đồng','🚿','R'],['Găng tay vườn','🧤','R'],['Cuốc bạc','⛏️','SR'],['Bình tưới cầu vồng','🌈','SSR']];
const fresh=()=>({coins:180,tickets:6,xp:0,seeds:{carrot:12,wheat:5,berry:3},bag:{carrot:0,wheat:0,berry:0},plots:Array.from({length:12},(_,i)=>({x:9+(i%4)*2,y:7+Math.floor(i/4)*2,crop:null,water:false,at:0})),staff:[],tools:[],pity:{staff:0,tool:0},stats:{planted:0,watered:0,harvested:0,sold:0,talked:[],built:0},claimed:[],expanded:false,coop:false,player:{x:11.5,y:11.5}});
let state;try{state=JSON.parse(localStorage.getItem('mayfarm-v1'))||fresh()}catch{state=fresh()}let facing='down',speed=0,arrival=0,actionFlash=0,footsteps=[],moveGoal=null;
// Preserve existing crops and inventory while adding walkable aisles.
if(!state.pixelLayout2){state.plots.forEach((p,i)=>{p.x=i<12?9+(i%4)*2:17+((i-12)%2)*2;p.y=i<12?7+Math.floor(i/4)*2:7+Math.floor((i-12)/2)*2});state.pixelLayout2=true;if(state.plots.some(p=>Math.floor(state.player.x)===p.x&&Math.floor(state.player.y)===p.y))state.player={x:11.5,y:12.5};}
let walkPhase=0,queueMode=false,jobs=[],effects=[],lastStatus=0;
const camera={x:W/2,y:H/2,follow:true,overview:false};
let tool='carrot',path=[],pending=null,zoom=1,last=0,anim=0,sound=false,audioCtx;let toastTimer;

const WEATHER_SECONDS=75,weatherCycle=['sun','rain','heat','cool','storm'];
const weatherTypes={
 sun:{name:'Nắng nhẹ',icon:'☀️',desc:'Lúa mì lớn nhanh. Không khí khô nhẹ.',rates:{carrot:1.15,wheat:1.3,berry:.95},stress:{carrot:0,wheat:0,berry:0},dry:.28},
 rain:{name:'Mưa rào',icon:'🌧️',desc:'Tự tưới cây. Dâu thích mưa; lúa mì dễ úng.',rates:{carrot:1.2,wheat:.85,berry:1.25},stress:{carrot:0,wheat:.09,berry:0},dry:0},
 heat:{name:'Nắng gắt',icon:'🌤️',desc:'Đất nhanh khô. Dâu và cà rốt dễ mất chất lượng.',rates:{carrot:.75,wheat:1.15,berry:.6},stress:{carrot:.12,wheat:0,berry:.25},dry:1.35},
 cool:{name:'Se lạnh',icon:'❄️',desc:'Dâu lớn nhanh; lúa mì chậm và nhạy với lạnh.',rates:{carrot:1.1,wheat:.8,berry:1.35},stress:{carrot:0,wheat:.06,berry:0},dry:.15},
 storm:{name:'Giông gió',icon:'⛈️',desc:'Mưa tưới cây, gió làm chậm và giảm chất lượng mọi giống.',rates:{carrot:.65,wheat:.6,berry:.7},stress:{carrot:.18,wheat:.24,berry:.3},dry:0}
};
function weatherAt(time=Date.now()){let index=Math.max(0,Math.floor((time-state.weatherEpoch)/(WEATHER_SECONDS*1000))),key=weatherCycle[index%weatherCycle.length];return {...weatherTypes[key],key,index,end:state.weatherEpoch+(index+1)*WEATHER_SECONDS*1000}}
function initWeather(now=Date.now()){
 if(!Number.isFinite(state.weatherEpoch))state.weatherEpoch=now;
 state.produceValue??={carrot:state.bag.carrot*crops.carrot.price,wheat:state.bag.wheat*crops.wheat.price,berry:state.bag.berry*crops.berry.price};
 for(let p of state.plots)initPlot(p,now);
}
function initPlot(p,now){if(!p.crop)return;p.work??=p.water?Math.min(crops[p.crop].time,Math.max(0,(now-p.at)/1000)):0;p.health??=100;p.moisture??=p.water?100:0;p.lastSim??=now;p.protectedUntil??=0;}
function tickPlot(p,now=Date.now()){
 if(!p.crop)return;initPlot(p,now);let t=Math.min(p.lastSim,now),required=crops[p.crop].time;
 // Split on weather, shelter, drying and maturity boundaries for consistent offline progress.
 while(t<now&&p.work<required-.00001){let w=weatherAt(t),covered=p.protectedUntil>t,rain=w.key==='rain'||w.key==='storm';
 if(rain){p.water=true;p.moisture=100}
 let wet=p.water&&p.moisture>.00001,rate=wet?(covered?1:w.rates[p.crop]):0,drain=covered?w.dry*.35:w.dry;
 let end=Math.min(now,w.end,covered?p.protectedUntil:Infinity,rate>0?t+(required-p.work)/rate*1000:Infinity,wet&&drain>0?t+p.moisture/drain*1000:Infinity);
 let seconds=Math.max(0,(end-t)/1000);if(seconds<.000001){t+=.01;continue}
 p.work=Math.min(required,p.work+rate*seconds);
 if(p.water&&!rain)p.moisture=Math.max(0,p.moisture-drain*seconds);
 let damage=covered?0:w.stress[p.crop]+(p.water&&!wet?.2:0),recovery=wet&&damage===0?.03:0;
 p.health=Math.min(100,Math.max(50,p.health+(recovery-damage)*seconds));t=end;
 }
 p.lastSim=now;
}
function cropProgress(p){return p.crop?Math.min(1,(p.work||0)/crops[p.crop].time):0}
function cropPrice(p){return Math.max(1,Math.round(crops[p.crop].price*(p.health??100)/100))}
function harvestPlot(p){addEffect(p,'harvest');let k=p.crop;state.bag[k]++;state.produceValue[k]+=cropPrice(p);state.stats.harvested++;state.xp+=10;p.crop=null;p.water=false;p.work=0;p.moisture=0;}
function waterPlot(p){addEffect(p,'water');tickPlot(p);p.water=true;p.moisture=100;p.lastSim=Date.now();p.at=p.at||Date.now();if(!p.lastCare||Date.now()-p.lastCare>=10000){p.health=Math.min(100,(p.health??100)+8);p.lastCare=Date.now()}state.stats.watered++;}
function weatherPanel(){let w=weatherAt();modal('<div class="eyebrow">TRẠM KHÍ TƯỢNG THUNG LŨNG</div><h2>'+w.icon+' '+w.name+'</h2><p>'+w.desc+'</p><p>Mỗi đợt kéo dài 75 giây. Thời tiết và cây tiếp tục được tính khi đóng game. Cây chín giữ nguyên chất lượng.</p><div class="weather-table"><table><thead><tr><th>Thời tiết</th>'+Object.values(crops).map(c=>'<th>'+c.icon+' '+c.name+'</th>').join('')+'</tr></thead><tbody>'+weatherCycle.map(key=>{let v=weatherTypes[key];return '<tr class="'+(key===w.key?'current':'')+'"><th>'+v.icon+' '+v.name+'</th>'+Object.keys(crops).map(k=>'<td>'+Math.round((v.rates[k]-1)*100)+'% tốc độ<br><small>'+(v.stress[k]?'−'+(v.stress[k]*10).toFixed(1)+' chất lượng / 10s':'Không gây hại')+'</small></td>').join('')+'</tr>'}).join('')+'</tbody></table></div><p>Độ ẩm bằng 0: cây ngừng lớn và mất 2 điểm chất lượng / 10s. Bình tưới phục hồi nước và tối đa 8 điểm chất lượng mỗi 10s. Chất lượng tối thiểu 50%; giá bán được chốt lúc thu hoạch.</p><p><b>Che luống:</b> chọn công cụ Che luống rồi bấm cây; tốn 8 xu, hiệu lực 120 giây. Chặn tác hại thời tiết, giảm 65% tốc độ mất nước và cho cây lớn ở tốc độ chuẩn. Mưa vẫn tưới qua lớp che.</p>')}
function updateWeatherUI(){let w=weatherAt(),next=weatherTypes[weatherCycle[(w.index+1)%weatherCycle.length]],seconds=Math.max(1,Math.ceil((w.end-Date.now())/1000));$('#farmDay').textContent='MÙA XUÂN · NGÀY '+String(1+Math.max(0,Math.floor((Date.now()-state.weatherEpoch)/375000))).padStart(2,'0');$('#seasonAdvice').textContent=({sun:'Lúa mì đón nắng · +30%',rain:'Dâu đón mưa · +25%',heat:'Ưu tiên lúa mì · giữ ẩm',cool:'Dâu thích se lạnh · +35%',storm:'Che luống để giữ chất lượng'})[w.key];$('#readyCount').textContent=state.plots.filter(p=>ready(p)).length;$('#weatherName').textContent=w.icon+' '+w.name;$('#weatherNext').textContent='Tiếp: '+next.name+' · '+seconds+'s';$('#weatherSummary').textContent=w.desc;$('#weatherCrops').innerHTML=Object.entries(crops).map(([k,c])=>'<span class="'+(w.stress[k]?'bad':w.rates[k]>1?'good':'neutral')+'">'+c.icon+' '+c.name+' '+(w.rates[k]>=1?'+':'')+Math.round((w.rates[k]-1)*100)+'%'+(w.stress[k]?' · dễ tổn thương':'')+'</span>').join('');}
function tickFarm(now=Date.now()){for(let p of state.plots)tickPlot(p,now)}
function terrain(index,x,y,w,h){if(!terrainAtlas.complete||!terrainAtlas.naturalWidth)return false;let cw=terrainAtlas.naturalWidth/2,ch=terrainAtlas.naturalHeight/2;ctx.imageSmoothingEnabled=false;ctx.drawImage(terrainAtlas,index%2*cw,Math.floor(index/2)*ch,cw,ch,x,y,w,h);return true}
function groundArea(index,x,y,w,h){ctx.save();ctx.beginPath();ctx.rect(x,y,w,h);ctx.clip();let tile=index===0?160:100;for(let py=Math.floor(y/tile)*tile;py<y+h;py+=tile)for(let px=Math.floor(x/tile)*tile;px<x+w;px+=tile)terrain(index,px,py,tile,tile);ctx.restore()}
function drawWeather(){let w=weatherAt(),clock=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?0:anim;
 ctx.save();ctx.beginPath();let v=viewport();ctx.rect(v.left,v.up,v.worldWidth,v.worldHeight);ctx.clip();
 if(w.key==='sun'){rect(0,0,W,H,'#f8d5750b');for(let i=0;i<10;i++){let x=(i*127+clock*5)%W,y=40+(i*71)%500;rect(x,y,2,2,'#fff4b9aa')}}
 if(w.key==='heat'){rect(0,0,W,H,'#f3a03422');for(let i=0;i<12;i++){let x=(i*97+Math.sin(clock+i)*5)%W,y=(i*53-clock*13)%H;if(y<0)y+=H;rect(x,y,14,2,'#ffdb8055')}}
 if(w.key==='rain'||w.key==='storm'){rect(0,0,W,H,w.key==='storm'?'#1a294b44':'#6f9eae20');let n=w.key==='storm'?145:80;for(let i=0;i<n;i++){let x=((i*83-clock*(w.key==='storm'?115:40))%W+W)%W,y=(i*67+clock*270)%H;rect(x,y,2,9,'#c7e7eb9c');rect(x-2,y+8,2,5,'#b8dce98c');if(i%6===0){let sy=300+(i*17)%280;rect(x,sy,5,1,'#d1e6e070')}}}
 if(w.key==='storm'){for(let i=0;i<13;i++){let x=((i*97-clock*100)%W+W)%W,y=150+(i*41)%400;rect(x,y,10,3,'#8b9c5566');rect(x-4,y+3,6,2,'#b4bd6c66')}}
 if(w.key==='cool'){rect(0,0,W,H,'#b7d9ee1a');for(let i=0;i<24;i++){let x=(i*97+clock*8)%W,y=(i*53+clock*17)%H;rect(x,y,3,3,'#e0f0db99')}}ctx.restore();
}
function toast(t){$('#toast').textContent=t;$('#toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),3300)}
function save(){try{localStorage.setItem('mayfarm-v1',JSON.stringify(state));$('#saveStatus').textContent='✓ Đã lưu trên trình duyệt'}catch{$('#saveStatus').textContent='Không thể lưu trên trình duyệt này'}}
function ping(){if(!sound)return;audioCtx??=new(window.AudioContext||window.webkitAudioContext)();let o=audioCtx.createOscillator(),g=audioCtx.createGain();o.connect(g);g.connect(audioCtx.destination);o.frequency.value=660;g.gain.setValueAtTime(.035,audioCtx.currentTime);g.gain.exponentialRampToValueAtTime(.001,audioCtx.currentTime+.15);o.start();o.stop(audioCtx.currentTime+.15)}
const quests=[{id:'plant',title:'Những hạt mầm đầu tiên',desc:'Gieo 3 ô cây trong trang trại.',value:()=>state.stats.planted,target:3,coins:50,tickets:1},{id:'water',title:'Một chút nước, một chút yêu thương',desc:'Tưới nước cho 3 ô cây để cây bắt đầu lớn.',value:()=>state.stats.watered,target:3,coins:40,tickets:1},{id:'harvest',title:'Mùa thu hoạch đầu tiên',desc:'Thu hoạch 5 ô cây đã trưởng thành.',value:()=>state.stats.harvested,target:5,coins:100,tickets:2},{id:'friends',title:'Xin chào, hàng xóm!',desc:'Nói chuyện với cả 3 NPC trong làng.',value:()=>state.stats.talked.length,target:3,coins:60,tickets:1},{id:'sale',title:'Phiên chợ đầu mùa',desc:'Bán 5 nông sản tại cửa hàng.',value:()=>state.stats.sold,target:5,coins:80,tickets:1},{id:'staff',title:'Cùng nhau làm vườn',desc:'Tuyển được nhân viên đầu tiên.',value:()=>state.staff.length,target:1,coins:50,tickets:1},{id:'build',title:'Trang trại lớn hơn',desc:'Mở rộng đất hoặc xây chuồng gà.',value:()=>state.stats.built,target:1,coins:100,tickets:2}];
function ui(){ updateWeatherUI();$('#readyCount').textContent=state.plots.filter(p=>ready(p)).length;$('#workingCount').textContent=state.staff.filter(s=>s.on).length;$('#coins').textContent='🪙 '+state.coins.toLocaleString('vi');$('#tickets').textContent='🎟 '+state.tickets;$('#level').textContent='Cấp '+(1+Math.floor(state.xp/100))+' · '+state.xp%100+'/100 XP';$('#xpbar').style.width=state.xp%100+'%';let q=quests.find(q=>!state.claimed.includes(q.id));$('#questTitle').textContent=q?q.title:'Một trang trại đang lớn lên';$('#questDesc').textContent=q?q.desc+' ('+Math.min(q.value(),q.target)+'/'+q.target+')':'Bạn đã hoàn thành hành trình mở đầu. Tiếp tục mở rộng nhé!';$('#qbadge').textContent=quests.filter(q=>!state.claimed.includes(q.id)&&q.value()>=q.target).length||'!';save()}
function modal(html){$('#modalBody').innerHTML=html;if(!$('#modal').open)$('#modal').showModal()}
$('#close').onclick=()=>$('#modal').close();$('#modal').onclick=e=>{if(e.target===$('#modal'))$('#modal').close()};
function panel(name){if(name==='weather'){weatherPanel();return}document.querySelectorAll('nav button').forEach(b=>b.classList.toggle('active',b.dataset.panel===name));if(name==='farm'){$('#modal').close();return}if(name==='quests'){modal('<div class="eyebrow">TỪNG BƯỚC MỘT</div><h2>Nhật ký nhiệm vụ</h2><p>Làm quen với thung lũng và nhận những phần quà đầu tiên.</p>'+quests.map(q=>`<div class="card"><span class="icon">${state.claimed.includes(q.id)?'✅':'📜'}</span><div><h3>${q.title}</h3><p>${q.desc}</p><p>${Math.min(q.value(),q.target)}/${q.target} · 🪙 ${q.coins} · 🎟 ${q.tickets}</p></div><button data-claim="${q.id}" ${state.claimed.includes(q.id)||q.value()<q.target?'disabled':''}>${state.claimed.includes(q.id)?'Đã nhận':'Nhận quà'}</button></div>`).join(''));document.querySelectorAll('[data-claim]').forEach(b=>b.onclick=()=>{let q=quests.find(q=>q.id===b.dataset.claim);if(state.claimed.includes(q.id)||q.value()<q.target)return;state.claimed.push(q.id);state.coins+=q.coins;state.tickets+=q.tickets;state.xp+=25;ui();panel('quests');ping();toast('Đã nhận phần thưởng nhiệm vụ!')})}
if(name==='bag'){modal('<div class="eyebrow">QUẦY HÀNG CỦA CÔ LAN</div><h2>Túi đồ & cửa hàng</h2><p>Mua hạt giống bằng xu. Thu hoạch rồi bán nông sản để phát triển trang trại.</p>'+Object.entries(crops).map(([k,c])=>`<div class="card"><span class="icon">${c.icon}</span><div><h3>${c.name}</h3><p>Hạt: ${state.seeds[k]} · Nông sản: ${state.bag[k]}</p><p>Cơ bản ${c.time}s · Giá chuẩn ${c.price} xu / quả</p><p>Giá bán thực tế phụ thuộc chất lượng lúc thu hoạch.</p></div><button data-buy="${k}">5 hạt · ${c.cost*5} xu</button></div>`).join('')+'<button class="primary" id="sellModal">Bán tất cả nông sản</button>');document.querySelectorAll('[data-buy]').forEach(b=>b.onclick=()=>{let k=b.dataset.buy,c=crops[k];if(state.coins<c.cost*5)return toast('Bạn chưa đủ xu. Hãy thu hoạch hoặc làm nhiệm vụ.');state.coins-=c.cost*5;state.seeds[k]+=5;ui();panel('bag');toast('Đã mua 5 hạt '+c.name)});$('#sellModal').onclick=sell}
if(name==='staff'){modal('<div class="eyebrow">NHỮNG NGƯỜI BẠN ĐỒNG HÀNH</div><h2>Nhân viên trang trại</h2><p>Phân công để nhân viên tự tưới hoặc thu hoạch mỗi 8 giây khi game đang mở. Tối đa 3 người làm việc cùng lúc.</p>'+(state.staff.length?state.staff.map((s,i)=>`<div class="card"><span class="icon">${s.icon}</span><div><h3>${s.name} · ${s.rarity}</h3><p>${s.role} · Cấp ${s.lv} · ${s.on?'Đang làm việc':'Đang nghỉ'}</p></div><button data-assign="${i}">${s.on?'Cho nghỉ':'Phân công'}</button></div>`).join(''):'<div class="big-icon">👒</div><p>Chưa có nhân viên. Ghé nhà tuyển dụng để gặp người bạn đầu tiên.</p>'));document.querySelectorAll('[data-assign]').forEach(b=>b.onclick=()=>{let s=state.staff[+b.dataset.assign];if(!s.on&&state.staff.filter(s=>s.on).length>=3)return toast('Tối đa 3 nhân viên làm việc.');s.on=!s.on;ui();panel('staff')})}
if(name==='gacha'){modal('<div class="eyebrow">GẶP GỠ ĐIỀU BẤT NGỜ</div><h2>Nhà tuyển dụng ✨</h2><p>Dùng vé từ nhiệm vụ để tìm cộng sự và dụng cụ. Mỗi lượt tốn 1 vé.</p><div class="card"><span class="icon">✉️</span><div><h3>Tuyển nhân viên</h3><p>R 75% · SR 22% · SSR 3%</p><p>Bảo đảm SSR: '+state.pity.staff+'/20 lượt</p></div><button class="primary" data-pull="staff">Tuyển · 🎟 1</button></div><div class="card"><span class="icon">🧰</span><div><h3>Rương dụng cụ</h3><p>R 75% · SR 22% · SSR 3%</p><p>Bảo đảm SSR: '+state.pity.tool+'/20 lượt</p></div><button data-pull="tool">Mở · 🎟 1</button></div><p>Nhận trùng nhân viên sẽ tăng cấp. Dụng cụ trùng tăng bậc. Mỗi bậc dụng cụ tăng 2% giá bán nông sản, tối đa 30%. Mốc bảo đảm tính riêng từng nhóm và đặt lại khi nhận SSR.</p><div class="pills"><span>🎟 Còn '+state.tickets+' vé</span><span>Không dùng tiền thật</span></div>');document.querySelectorAll('[data-pull]').forEach(b=>b.onclick=()=>pull(b.dataset.pull))}
if(name==='build'){modal('<div class="eyebrow">DỰNG XÂY TỪNG NGÀY</div><h2>Xưởng của bác Mộc</h2><p>Đầu tư xu để mở rộng trang trại.</p><div class="card"><span class="icon">🌱</span><div><h3>Mở rộng ruộng</h3><p>Thêm 8 ô đất để gieo trồng.</p></div><button id="expand" '+(state.expanded?'disabled':'')+'>'+(state.expanded?'Đã mở':'250 xu')+'</button></div><div class="card"><span class="icon">🐔</span><div><h3>Chuồng gà</h3><p>Tạo 10 xu mỗi 20 giây khi game mở.</p></div><button id="coop" '+(state.coop?'disabled':'')+'>'+(state.coop?'Đã xây':'350 xu')+'</button></div>');$('#expand').onclick=()=>build('expanded',250);$('#coop').onclick=()=>build('coop',350)} }
function build(k,cost){if(state[k])return;if(state.coins<cost)return toast('Cần thêm xu để xây công trình.');state.coins-=cost;state[k]=true;state.stats.built++;if(k==='expanded')for(let i=0;i<8;i++)state.plots.push({x:17+(i%2)*2,y:7+Math.floor(i/2)*2,crop:null,at:0,water:false});ui();panel('build');toast('Trang trại đã có thêm điều mới!')}
function pull(type){if(state.tickets<1)return toast('Hết vé rồi! Hoàn thành nhiệm vụ để nhận thêm.');state.tickets--;let r=Math.random(),rarity=state.pity[type]>=19?'SSR':r<.03?'SSR':r<.25?'SR':'R';state.pity[type]=rarity==='SSR'?0:state.pity[type]+1;let pool=(type==='staff'?staffPool:toolPool).filter(s=>s[type==='staff'?3:2]===rarity),item=pool[Math.floor(Math.random()*pool.length)],collection=type==='staff'?state.staff:state.tools,old=collection.find(s=>s.name===item[0]);if(old)old.lv++;else collection.push({name:item[0],icon:item[1],rarity,role:type==='staff'?item[2]:'Dụng cụ',lv:1,on:false});ui();ping();modal('<div class="eyebrow">'+(old?'MỘT NGƯỜI BẠN QUEN THUỘC':'MỘT KHỞI ĐẦU MỚI')+'</div><div class="big-icon">'+item[1]+'</div><h2 style="text-align:center">'+item[0]+'</h2><div class="pills" style="justify-content:center"><span>'+rarity+'</span><span>'+(old?'Đã nâng lên cấp '+old.lv:'Đã thêm vào bộ sưu tập')+'</span></div><p style="text-align:center">'+(type==='staff'?'Vào Nhân viên để phân công công việc.':'Dụng cụ tự tăng giá bán nông sản.')+'</p><button id="again" class="primary" style="width:100%;margin-top:20px">Quay tiếp · 🎟 1</button><button id="backGacha" style="width:100%;margin-top:8px">Về nhà tuyển dụng</button>');$('#again').onclick=()=>pull(type);$('#backGacha').onclick=()=>panel('gacha')}
function sell(){let total=0,n=0,bonus=1+Math.min(.3,state.tools.reduce((v,t)=>v+t.lv*.02,0));for(let[k,c]of Object.entries(crops)){n+=state.bag[k];total+=Math.floor(state.produceValue[k]*bonus);state.bag[k]=0;state.produceValue[k]=0}if(!n)return toast('Chưa có nông sản. Hãy thu hoạch cây đã lớn.');state.coins+=total;state.stats.sold+=n;state.xp+=n*3;ui();if($('#modal').open)panel('bag');ping();toast('Đã bán '+n+' nông sản · +'+total+' xu')}
function ready(p){tickPlot(p);return p.crop&&p.work>=crops[p.crop].time-.00001}
function action(p,auto){tickPlot(p);
 if(tool==='protect'&&!auto){if(!p.crop)return toast('Chỉ che được luống đang có cây.');if((p.protectedUntil||0)>Date.now())return toast('Luống còn được bảo vệ '+Math.ceil((p.protectedUntil-Date.now())/1000)+' giây.');if(state.coins<8)return toast('Cần 8 xu để che luống.');state.coins-=8;p.protectedUntil=Date.now()+120000;ui();return toast('Đã che luống trong 120 giây. Cây lớn ở tốc độ chuẩn, không chịu tác hại thời tiết.')}
 if(p.crop&&ready(p)){let quality=Math.round(p.health),value=cropPrice(p);harvestPlot(p);if(!auto)toast('Thu hoạch! Chất lượng '+quality+'% · giá '+value+' xu · +10 XP');ping()}
 else if(p.crop&&(tool==='water'||auto)){waterPlot(p);if(!auto)toast('Đã tưới! Độ ẩm 100% · Chất lượng '+Math.round(p.health)+'%.')}
 else if(!p.crop&&!auto&&crops[tool]){if(state.seeds[tool]<1)return toast('Hết hạt giống. Ghé cửa hàng mua thêm nhé.');state.seeds[tool]--;Object.assign(p,{crop:tool,water:false,at:0,work:0,health:100,moisture:0,lastSim:Date.now(),protectedUntil:0,lastCare:0});state.stats.planted++;tickPlot(p);toast('Đã gieo '+crops[tool].name+'. Tưới nước hoặc chờ mưa để cây lớn.')}
 else if(!auto){toast(p.crop?'Cây lớn '+Math.floor(cropProgress(p)*100)+'% · Nước '+Math.round(p.moisture)+'% · Chất lượng '+Math.round(p.health)+'%.':'Chọn hạt giống rồi bấm vào ô đất.')}ui();
}
const npcs=[{x:5,y:6,name:'Cô Lan',icon:'👩‍🌾',color:'#bc775e',panel:'bag',text:'Chào con! Cửa hàng có những hạt giống tốt nhất mùa này. Cô cũng mua nông sản của con nữa.'},{x:19,y:6,name:'Bác Mộc',icon:'👨‍🔧',color:'#7c8b9b',panel:'build',text:'Có thêm đất và một chuồng gà, trang trại sẽ nhộn nhịp hơn đấy. Cháu muốn xây gì nào?'},{x:18,y:11,name:'Bạn An',icon:'👩',color:'#bf9a6b',panel:'quests',text:'Chào mừng bạn đến thung lũng Mây! Mình đã ghi vài việc vào sổ nhiệm vụ. Hoàn thành để nhận vé tuyển bạn đồng hành nhé.'}];
function talk(n){if(!state.stats.talked.includes(n.name))state.stats.talked.push(n.name);ui();modal('<div class="big-icon">'+n.icon+'</div><h2>'+n.name+'</h2><p>'+n.text+'</p><button class="primary" id="npcNext" style="margin-top:20px">'+(n.panel==='bag'?'Ghé cửa hàng':n.panel==='build'?'Xem công trình':'Mở nhật ký')+'</button>');$('#npcNext').onclick=()=>panel(n.panel)}
const treeLocations=[[42,155,1.4],[78,85,1.2],[280,120,.9],[580,110,1.3],[910,120,1.6],[960,205,1.2],[855,290,1],[60,390,1.4],[150,465,1.1],[75,550,1.5],[975,345,1.2],[850,88,.7]];
function blocked(x,y){
 if(x<1||x>23||y<1||y>13)return true;
 if((x>=3&&x<=6&&y>=2&&y<=4)||(x>=17&&x<=20&&y>=2&&y<=4)||(x>=9&&x<=13&&y>=2&&y<=4))return true;
 if(x>=21&&y>=10&&y!==11)return true;
 if(state.coop&&x>=3&&x<=5&&y>=9&&y<=10)return true;
 if(state.plots.some(p=>p.x===x&&p.y===y))return true;
 if((y===6||y===13)&&x>=7&&x<=16&&x!==11&&x!==12)return true;
 if(npcs.some(n=>n.x===x&&n.y===y))return true;
 return treeLocations.some(([tx,ty])=>Math.hypot((x+.5)*C-tx,(y+.5)*C-ty)<22);
}
// Eight-way A*: diagonal travel costs sqrt(2), with no cutting blocked corners.
function findPath(tx,ty,fromX=state.player.x,fromY=state.player.y){
 if(blocked(tx,ty))return null;
 let sx=Math.floor(fromX),sy=Math.floor(fromY),key=(x,y)=>x+','+y,start=key(sx,sy),target=key(tx,ty);
 let open=[{x:sx,y:sy,k:start,g:0,f:0}],cost=new Map([[start,0]]),prev=new Map(),closed=new Set();
 while(open.length){open.sort((a,b)=>a.f-b.f);let u=open.shift();if(closed.has(u.k))continue;
 if(u.k===target){let out=[],k=target;while(k!==start){let[x,y]=k.split(',').map(Number);out.unshift({x:x+.5,y:y+.5});k=prev.get(k)}
 if(out.length&&Math.hypot(fromX-sx-.5,fromY-sy-.5)>.03){if(!canWalkSegment({x:fromX,y:fromY},out[0]))out.unshift({x:sx+.5,y:sy+.5});}
 return out;}
 closed.add(u.k);
 for(let[dx,dy]of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){
 let x=u.x+dx,y=u.y+dy,k=key(x,y);if(blocked(x,y)||closed.has(k)||(dx&&dy&&(blocked(u.x+dx,u.y)||blocked(u.x,u.y+dy))))continue;
 let g=u.g+Math.hypot(dx,dy);if(g>=(cost.get(k)??Infinity))continue;cost.set(k,g);prev.set(k,u.k);
 let ax=Math.abs(tx-x),ay=Math.abs(ty-y),h=Math.max(ax,ay)+(Math.SQRT2-1)*Math.min(ax,ay);open.push({x,y,k,g,f:g+h});
 }}return null;
}
function routeLength(p){let x=state.player.x,y=state.player.y,d=0;for(let t of p){d+=Math.hypot(t.x-x,t.y-y);x=t.x;y=t.y}return d}
function nearestRoute(tx,ty,radius=3,adjacent=false){let candidates=[];for(let y=ty-radius;y<=ty+radius;y++)for(let x=tx-radius;x<=tx+radius;x++){
 let distance=Math.hypot(x-tx,y-ty);if(distance>radius||(adjacent&&distance!==1)||blocked(x,y))continue;let p=findPath(x,y);if(p!==null)candidates.push({p,x,y,score:(adjacent?0:distance*10)+routeLength(p)});
 }candidates.sort((a,b)=>a.score-b.score);return candidates[0]||null}
function walk(tx,ty,fn,interact=false){
 // Every new click cancels the old destination and pending interaction.
 pending=null;let route=interact?nearestRoute(tx,ty,1,true):blocked(tx,ty)?nearestRoute(tx,ty):{p:findPath(tx,ty),x:tx,y:ty};
 if(!route||route.p===null){path=[];moveGoal=null;speed=0;return toast('Không tìm được lối đi. Hãy chọn một vị trí gần hơn.');}
 camera.follow=true;camera.overview=false;path=route.p;pending=fn;moveGoal={x:route.x+.5,y:route.y+.5,t:anim,interact};arrival=0;
 if(!path.length){arrival=anim;moveGoal=null;if(pending){let f=pending;pending=null;actionFlash=.5;f()}runNextJob();}
}
function viewMetrics(){const r=canvas.getBoundingClientRect(),mobile=r.width<=760||(r.height<=520&&r.width<=1100),landscape=r.width>r.height;
 let hb=$('.hud-top')?.getBoundingClientRect?.().bottom,tt=$('.toolbar')?.getBoundingClientRect?.().top;
 let top=Number.isFinite(hb)?hb-r.top+16:mobile?(landscape?100:185):195,bottom=tt>r.top+50?r.height-tt+r.top+12:mobile?(landscape?175:265):220;
 if(mobile&&!landscape)bottom=Math.max(265,bottom);
 const available=Math.max(90,r.height-top-bottom),scale=camera.overview?Math.max(.1,Math.min((r.width-30)/W,available/H)):mobile?1.2:Math.max(.95,Math.min(1.25,r.width/1100));
 return {r,mobile,landscape,top,bottom,scale,focusY:top+available/2};}
function viewport(){let m=viewMetrics(),scale=m.scale*zoom,cy=camera.overview?H/2+(m.r.height/2-m.focusY)/scale:camera.y,cx=camera.overview?W/2:camera.x;
 return {...m,scale,ox:m.r.width/2-cx*scale,oy:m.r.height/2-cy*scale,left:cx-m.r.width/scale/2,up:cy-m.r.height/scale/2,worldWidth:m.r.width/scale,worldHeight:m.r.height/scale};}
function screenToWorld(clientX,clientY){let v=viewport();return{x:(clientX-v.r.left-v.ox)/v.scale,y:(clientY-v.r.top-v.oy)/v.scale}}
function updateCamera(dt){let m=viewMetrics();if(camera.overview)return;if(camera.follow){let targetX=state.player.x*C,targetY=state.player.y*C+(m.r.height/2-m.focusY)/(m.scale*zoom),k=1-Math.exp(-dt*10);camera.x+=(targetX-camera.x)*k;camera.y+=(targetY-camera.y)*k}
 camera.x=Math.max(0,Math.min(W,camera.x));camera.y=Math.max(0,Math.min(H,camera.y));}
function handleMapTap(e){let {x:vx,y:vy}=screenToWorld(e.clientX,e.clientY),x=Math.floor(vx/C),y=Math.floor(vy/C);
 if(x<0||x>=cols||y<0||y>=rows)return;
 let n=npcs.find(n=>Math.hypot((n.actor?.x??n.x+.5)-vx/C,(n.actor?.y??n.y+.5)-vy/C)<.85);if(n){jobs=[];n.hold=anim+12;return walk(Math.floor(n.actor?.x??n.x+.5),Math.floor(n.actor?.y??n.y+.5),()=>talk(n),true)}
 let p=state.plots.find(p=>p.x===x&&p.y===y);if(p){let selectedTool=tool;return scheduleJob(x,y,()=>{let current=tool;tool=selectedTool;action(p,false);tool=current},true)}
 scheduleJob(x,y,null);
}
function canWalkSegment(a,b){let d=Math.hypot(b.x-a.x,b.y-a.y),steps=Math.max(1,Math.ceil(d/.1)),startX=Math.floor(a.x),startY=Math.floor(a.y);
 for(let i=1;i<=steps;i++){let x=a.x+(b.x-a.x)*i/steps,y=a.y+(b.y-a.y)*i/steps;for(let[dx,dy]of [[-.16,-.16],[.16,-.16],[-.16,.16],[.16,.16]]){let gx=Math.floor(x+dx),gy=Math.floor(y+dy);if(blocked(gx,gy)&&(gx!==startX||gy!==startY))return false}}return true;
}
function scheduleJob(x,y,fn,interact=false){if(queueMode&&(path.length||pending)){if(jobs.length>=8)return toast('Có thể xếp tối đa 8 việc.');if(jobs.some(j=>j.x===x&&j.y===y&&j.tool===tool))return;jobs.push({x,y,fn,interact,tool});toast('Đã xếp việc '+jobs.length+' · nhân vật sẽ làm lần lượt');return;}if(!queueMode)jobs=[];walk(x,y,fn,interact)}
function runNextJob(){if(path.length||pending||!jobs.length)return;let j=jobs.shift();walk(j.x,j.y,j.fn,j.interact);if(!path.length&&!pending&&jobs.length)runNextJob();}
function stopJobs(){jobs=[];path=[];pending=null;moveGoal=null;speed=0;$('#movementStatus').textContent='Đã dừng · chọn một điểm mới';}
$('#queueMode').onclick=()=>{queueMode=!queueMode;$('#queueMode').classList.toggle('active',queueMode);$('#queueMode').setAttribute?.('aria-pressed',String(queueMode));toast(queueMode?'Liên tiếp: chạm nhiều luống để xếp việc.':'Chạm đích mới để đổi hướng ngay.')};$('#stopMove').onclick=stopJobs;
function addEffect(p,kind){effects.push({x:(p.x+.5)*C,y:(p.y+.5)*C,kind,t:anim});}
function drawEffects(){effects=effects.filter(f=>anim-f.t<1);for(let f of effects){let t=anim-f.t;ctx.save();ctx.globalAlpha=1-t;for(let i=0;i<7;i++){let angle=i*6.28/7,dx=Math.cos(angle)*t*23,dy=Math.sin(angle)*t*15-t*20;rect(f.x+dx,f.y+dy,3,3,f.kind==='water'?'#9bdeeb':'#ffe8a0')}text(f.kind==='water'?'Đã tưới':'+1 nông sản',f.x,f.y-18-t*22,9,'#356b60');ctx.restore()}
 jobs.forEach((j,i)=>{ellipse((j.x+.5)*C,(j.y+.5)*C,9,6,'#ddf2d3dd');text(String(i+1),(j.x+.5)*C,(j.y+.5)*C+3,8,'#397268')});
}
function updateVillagers(dt){for(let i=0;i<npcs.length;i++){let n=npcs[i];n.actor??={x:n.x+.5,y:n.y+.5,path:[],wait:4+i*3,phase:0};let a=n.actor;if($('#modal').open||anim<(n.hold||0)||Math.hypot(a.x-state.player.x,a.y-state.player.y)<1.5)continue;
 if(!a.path.length){if(anim<a.wait)continue;let options=[[0,1],[1,1],[-1,1],[0,2],[1,0],[-1,0]],offset=options[Math.floor(Math.random()*options.length)],tx=n.x+offset[0],ty=n.y+offset[1];a.wait=anim+6+Math.random()*5;if(blocked(tx,ty)||path.some(p=>Math.hypot(p.x-tx-.5,p.y-ty-.5)<1))continue;let route=findPath(tx,ty,a.x,a.y);if(route)a.path=route;}
 if(a.path.length){let p=a.path[0],d=Math.hypot(p.x-a.x,p.y-a.y),step=Math.min(d,dt*1.1);if(Math.hypot(p.x-state.player.x,p.y-state.player.y)<1.2)continue;if(d>.001){a.x+=(p.x-a.x)/d*step;a.y+=(p.y-a.y)/d*step;a.phase+=step*2}if(d<=step+.001)a.path.shift();}
}}
const pointers=new Map();let gesture=null;
function pointerDistance(){let[a,b]=[...pointers.values()];return Math.hypot(a.x-b.x,a.y-b.y)}
function pointerCenter(){let[a,b]=[...pointers.values()];return{x:(a.x+b.x)/2,y:(a.y+b.y)/2}}
canvas.onpointerdown=e=>{if(e.button!==undefined&&e.button!==0)return;canvas.setPointerCapture?.(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});$('#mapHint').classList.add('quiet');
 if(pointers.size===1)gesture={startX:e.clientX,startY:e.clientY,lastX:e.clientX,lastY:e.clientY,moved:false};
 else if(pointers.size===2){let center=pointerCenter();gesture={moved:true,pinch:true,distance:pointerDistance(),zoom,anchor:screenToWorld(center.x,center.y)};camera.follow=false;}
};
canvas.onpointermove=e=>{if(!pointers.has(e.pointerId)||!gesture)return;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
 if(pointers.size>=2){if(!gesture.pinch)return;zoom=Math.max(.65,Math.min(2,gesture.zoom*pointerDistance()/Math.max(1,gesture.distance)));let center=pointerCenter(),v=viewport();if(!camera.overview){camera.x=gesture.anchor.x-(center.x-v.r.left-v.r.width/2)/v.scale;camera.y=gesture.anchor.y-(center.y-v.r.top-v.r.height/2)/v.scale}return;}
 if(gesture.pinch)return;if(Math.hypot(e.clientX-gesture.startX,e.clientY-gesture.startY)>7)gesture.moved=true;
 if(gesture.moved){camera.follow=false;if(camera.overview){let w=screenToWorld(e.clientX,e.clientY);camera.overview=false;camera.x=w.x;camera.y=w.y;}let v=viewport();camera.x=Math.max(0,Math.min(W,camera.x-(e.clientX-gesture.lastX)/v.scale));camera.y=Math.max(0,Math.min(H,camera.y-(e.clientY-gesture.lastY)/v.scale));}
 gesture.lastX=e.clientX;gesture.lastY=e.clientY;
};
function endPointer(e,cancelled=false){if(!pointers.has(e.pointerId))return;let tap=!cancelled&&pointers.size===1&&gesture&&!gesture.moved;pointers.delete(e.pointerId);if(tap)handleMapTap(e);if(!pointers.size)gesture=null;}
canvas.onpointerup=e=>endPointer(e);canvas.onpointercancel=e=>{endPointer(e,true);if(gesture)gesture.moved=true};canvas.onlostpointercapture=e=>{if(pointers.has(e.pointerId))endPointer(e,true)};
function zoomCamera(amount){camera.overview=false;zoom=Math.max(.65,Math.min(2,zoom+amount));$('#overview').setAttribute?.('aria-pressed','false')}
$('#centerCamera').onclick=()=>{camera.overview=false;camera.follow=true;zoom=1;updateCamera(1);toast('Camera đang theo nhân vật. Kéo để xem xung quanh.')};
$('#overview').onclick=()=>{camera.overview=!camera.overview;zoom=1;if(!camera.overview){camera.follow=true;updateCamera(1)}$('#overview').setAttribute?.('aria-pressed',String(camera.overview));};
$('#fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else if(document.documentElement.requestFullscreen)await document.documentElement.requestFullscreen();else toast('Trình duyệt này chưa hỗ trợ toàn màn hình. Có thể thêm game vào màn hình chính.')}catch{toast('Không bật được toàn màn hình trong trình duyệt này.')}};
document.querySelectorAll('[data-panel]').forEach(b=>b.onclick=()=>panel(b.dataset.panel));document.querySelectorAll('[data-tool]').forEach(b=>b.onclick=()=>{tool=b.dataset.tool;document.querySelectorAll('[data-tool]').forEach(v=>{v.classList.toggle('active',v===b);v.setAttribute('aria-pressed',String(v===b))});$('#selected').textContent=crops[tool]?crops[tool].icon+' Hạt '+crops[tool].name:tool==='water'?'🚿 Bình tưới':tool==='protect'?'🛡 Che luống · 8 xu':'🧺 Giỏ thu hoạch'});$('#sell').onclick=sell;$('#sound').onclick=()=>{sound=!sound;$('#sound').textContent='♪ Âm thanh: '+(sound?'bật':'tắt');$('#sound').setAttribute?.('aria-pressed',String(sound));ping()};$('#help').onclick=()=>{modal('<div class="eyebrow">CHẠM NHẸ, CHƠI THẢNH THƠI</div><h2>Điều khiển trang trại</h2><p><b>Chạm:</b> đi đến vị trí, làm việc với ruộng hoặc trò chuyện với NPC.</p><p><b>Kéo bản đồ:</b> xem xung quanh. Chụm hai ngón để thu/phóng.</p><p><b>⌖:</b> đưa camera về nhân vật. <b>▧:</b> xem toàn trang trại; chạm một nơi để nhân vật đi tới.</p><p><b>Liên tiếp:</b> bật ⇢ rồi chạm nhiều luống để xếp tối đa 8 việc. Nút ■ dừng nhân vật và hủy việc chờ.</p><p>Chọn hạt rồi chạm ruộng để gieo. Chọn bình tưới để tưới; cây chín có dấu ✓. Chọn Che luống để bảo vệ cây trong thời tiết xấu.</p><p>Chạm bảng thời tiết để xem dự báo và tác động đến từng giống. Tiến trình lưu trên trình duyệt này, thời tiết và cây tiếp tục được tính khi đóng game.</p><div class="pills"><button id="helpAudio">Âm thanh: '+(sound?'bật':'tắt')+'</button><button id="helpFullscreen">Toàn màn hình ⛶</button></div>');$('#helpAudio').onclick=()=>{$('#sound').onclick();$('#helpAudio').textContent='Âm thanh: '+(sound?'bật':'tắt')};$('#helpFullscreen').onclick=()=>$('#fullscreen').onclick()};$('#zoomin').onclick=()=>zoomCamera(.15);$('#zoomout').onclick=()=>zoomCamera(-.15);
function rect(x,y,w,h,c){ctx.fillStyle=c;ctx.fillRect(x,y,w,h)}function ellipse(x,y,rx,ry,c){ctx.fillStyle=c;ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,Math.PI*2);ctx.fill()}function text(t,x,y,size=12,color='#496044'){ctx.font=`${size}px 'Be Vietnam Pro',sans-serif`;ctx.textAlign='center';if(size>=8){let width=ctx.measureText(t).width;rect(x-width/2-4,y-size-2,width+8,size+6,'#fff2cfb8')}ctx.fillStyle=color;ctx.fillText(t,x,y)}
function tree(x,y,s=1){ellipse(x,y+8,24*s,8*s,'#708c4a33');if(!sprite('tree',x-32*s,y-72*s,64*s,80*s)){rect(x-4,y-25,8,30,'#977350');rect(x-25,y-65,50,43,'#73994f')}}
function house(x,y,w,h,roof,label){ellipse(x+w/2,y+h,w*.6,9,'#5f78372a');if(!sprite('house',x-12,y-42,w+24,h+45)){rect(x,y,w,h,'#eee1b5');rect(x-6,y-20,w+12,25,roof)}text(label,x+w/2,y+h+21,11,'#587244')}
const characterCells={down:0,left:1,right:2,up:3,lan:4,moc:5,an:6,chicken:7,carrot:8,wheat:9,berry:10,seedling:11,watering:12,seeds:13,flowers:14,rock:15};
const characterBounds=[[65,48,210,294],[382,48,210,294],[670,48,210,294],[988,48,210,294],[72,366,211,318],[385,366,211,318],[672,366,211,318],[973,419,250,267],[36,700,281,261],[349,700,257,261],[639,700,292,261],[995,774,224,188],[25,993,300,218],[348,974,265,238],[637,976,292,238],[953,993,285,218]];
function charSprite(name,x,y,w,h){let n=characterCells[name];if(n===undefined||!characterAtlas.complete||!characterAtlas.naturalWidth)return false;let r=characterBounds[n],scale=characterAtlas.naturalWidth/1280;ctx.imageSmoothingEnabled=false;ctx.drawImage(characterAtlas,r[0]*scale,r[1]*scale,r[2]*scale,r[3]*scale,Math.round(x),Math.round(y),w,h);return true}
function farmerFrame(x,y,moving,direction){if(!walkAtlas.complete||!walkAtlas.naturalWidth)return false;let row={down:0,left:1,right:2,up:3}[direction]??0,col=moving?Math.floor(walkPhase)%4:1,ys=[40,363,662,960],heights=[308,290,292,280],sx=walkAtlas.naturalWidth/1280,sy=walkAtlas.naturalHeight/1280;ctx.imageSmoothingEnabled=false;ctx.drawImage(walkAtlas,(col*300+70)*sx,ys[row]*sy,220*sx,heights[row]*sy,Math.round(x-17),Math.round(y-43),34,48);return true}
function person(x,y,color,hat=true,moving=false,kind='down',player=false){
 ellipse(x,y+4,10,4,'#31564233');if(player){ctx.strokeStyle='#9ee3c7bb';ctx.lineWidth=1.5;ctx.beginPath();ctx.ellipse(x,y+4,13,6,0,0,Math.PI*2);ctx.stroke();if(farmerFrame(x,y,moving,kind))return;}
 let bob=moving?Math.round(Math.abs(Math.sin(anim*8))*1):0;
 if(!charSprite(kind,x-17,y-43-bob,34,48)){rect(x-7,y-27,14,23,color);rect(x-6,y-42,12,15,'#e9be89');rect(x-11,y-44,22,5,'#d2a45a');rect(x-6,y-50,12,8,'#e3c377');rect(x-6,y-5,4,10,'#6d5036');rect(x+2,y-5,4,10,'#6d5036')}
}
function draw(){let dpr=Math.min(window.devicePixelRatio||1,2),r=canvas.getBoundingClientRect();if(canvas.width!==Math.round(r.width*dpr)||canvas.height!==Math.round(r.height*dpr)){canvas.width=Math.round(r.width*dpr);canvas.height=Math.round(r.height*dpr)}let view=viewport();ctx.setTransform(1,0,0,1,0,0);rect(0,0,canvas.width,canvas.height,'#739549');ctx.setTransform(view.scale*dpr,0,0,view.scale*dpr,view.ox*dpr,view.oy*dpr);ctx.imageSmoothingEnabled=false;groundArea(0,view.left,view.up,view.worldWidth,view.worldHeight);rect(view.left,view.up,view.worldWidth,view.worldHeight,'#b6cf9d6b');
for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){if((x*13+y*7)%37===0)charSprite('flowers',x*C+8,y*C+3,22,22)}
// Dirt paths and walkable garden aisles.
groundArea(1,50,219,790,42);groundArea(1,612,218,44,344);groundArea(1,287,218,43,327);groundArea(1,290,441,367,40);
rect(339,290,321,216,'#8eab6944');groundArea(1,345,298,310,197);rect(345,298,310,197,'#e9d6ac33');
// Pixel water tiles fill a pond at the edge of the garden.
rect(844,386,156,214,'#118ac0');
for(let py=386;py<600;py+=72)for(let px=844;px<1000;px+=100)sprite('water',px,py,104,75);
sprite('bridge',816,445,175,70);
text('Cầu ven hồ',910,535,10,'#3f6455');
// Fences
for(let x=282;x<674;x+=40){if(x>=440&&x<520)continue;sprite('fence',x,255,42,28);sprite('fence',x,519,42,28)}
for(let p of state.plots){let x=p.x*C,y=p.y*C;rect(x+1,y+2,38,36,'#715235');terrain(p.crop&&p.moisture>20?3:2,x+3,y+3,34,31);if(p.crop){let c=crops[p.crop],progress=cropProgress(p);if(progress>.99){charSprite(p.crop,x+1,y-4,38,38);rect(x+30,y+1,7,7,'#f9e2a3');text('✓',x+33,y+7,7,'#526a31')}else{charSprite(progress>.55?p.crop:'seedling',x+3,y+2,34,30);if(p.water){rect(x+5,y+33,30,3,'#5d513b');rect(x+5,y+33,30*progress,3,'#bace80')}else {rect(x+30,y+3,4,7,'#82c6dd');rect(x+29,y+7,6,3,'#82c6dd')}}}}
for(let p of state.plots){if(!p.crop)continue;let x=p.x*C,y=p.y*C;rect(x+3,y+37,34,2,'#59432d');rect(x+3,y+37,34*(p.moisture||0)/100,2,'#73bdd0');if(p.health<95){rect(x+3,y-4,27,3,'#695b46');rect(x+3,y-4,27*p.health/100,3,p.health<75?'#d88a54':'#d9c277')}
 if(p.protectedUntil>Date.now()){rect(x-2,y-8,44,3,'#d2b980');rect(x-2,y-8,3,39,'#b3925f');rect(x+39,y-8,3,39,'#b3925f');rect(x+1,y-5,38,8,'#d8c79899')}
}
// Orchard, hedges, village buildings
house(125,115,120,72,'#b87e62','Cửa hàng hạt giống');house(370,106,150,81,'#819c7c','Nhà của bạn');house(690,110,130,77,'#b69c72','Xưởng bác Mộc');
// Trees are drawn with actors below for correct depth ordering.

for(let x=80;x<950;x+=46){if(x>310&&x<650)continue;rect(x-17,569,39,17,'#6e9448');rect(x-11,561,26,15,'#81a354');rect(x-7,557,17,7,'#a0b66c')}
rect(730,346,62,6,'#a98b60');rect(734,352,5,19,'#8e7654');rect(782,352,5,19,'#8e7654');rect(730,332,62,10,'#b99b6c');charSprite('flowers',264,363,28,28);charSprite('flowers',251,390,24,24);charSprite('flowers',519,170,28,28);charSprite('flowers',344,170,28,28);charSprite('rock',55,273,35,31);charSprite('rock',748,408,36,30);sprite('flag',560,143,33,67);sprite('crate',257,178,30,29);sprite('crate',667,187,29,28);sprite('ladder',796,148,19,51);
if(state.coop){house(124,365,105,55,'#b39269','Chuồng gà');charSprite('chicken',227+Math.sin(anim)*6,419,30,30);charSprite('chicken',191+Math.sin(anim*.7)*9,444,28,28)}else{rect(128,369,90,45,'#b6c78e');text('KHU CHĂN NUÔI',173,396,8,'#7f9866')}
for(let f of footsteps){rect(f.x*C-2,f.y*C,4,2,'#6c74432b')}
if(path.length){ctx.setLineDash([2,8]);ctx.strokeStyle='#fff0b188';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(state.player.x*C,state.player.y*C);for(let p of path)ctx.lineTo(p.x*C,p.y*C);ctx.stroke();ctx.setLineDash([])}
if(moveGoal){let x=moveGoal.x*C,y=moveGoal.y*C,r=11+Math.sin(anim*5)*2;ctx.strokeStyle=moveGoal.interact?'#ffdc83':'#fff6bc';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x-r,y);ctx.lineTo(x,y-r/2);ctx.lineTo(x+r,y);ctx.lineTo(x,y+r/2);ctx.closePath();ctx.stroke()}
let actors=npcs.map((n,i)=>({...n,kind:['lan','moc','an'][i],px:(n.actor?.x??n.x+.5)*C,py:(n.actor?.y??n.y+.5)*C,moving:!!n.actor?.path.length}));treeLocations.forEach(([x,y,s])=>actors.push({tree:true,px:x,py:y,scale:s}));state.staff.filter(s=>s.on).forEach((s,i)=>actors.push({name:s.name,color:['#9aaf70','#ca9a77','#9b91ab'][i],px:350+i*70+Math.sin(anim*.7+i)*12,py:490+Math.cos(anim*.8+i)*8,staff:true}));actors.push({player:true,px:state.player.x*C,py:state.player.y*C,color:'#739492'});actors.sort((a,b)=>a.py-b.py);for(let a of actors){if(a.tree){tree(a.px,a.py,a.scale);continue}person(a.px,a.py,a.color,true,a.player&&path.length>0||a.staff||a.moving,a.player?facing:a.kind||'down',a.player);if(!a.player){text(a.name,a.px,a.py+19,9,'#4f6746');if(!a.staff){ellipse(a.px,a.py-52,8,9,'#fff7d4');text('•',a.px,a.py-48,12,'#b8994f')}}else{if(actionFlash>0){charSprite(tool==='water'?'watering':'seeds',a.px+12,a.py-28,24,24)}text('Bạn',a.px,a.py+19,9,'#446d4c');ctx.fillStyle='#fff5d2';ctx.beginPath();ctx.moveTo(a.px-4,a.py-48);ctx.lineTo(a.px+4,a.py-48);ctx.lineTo(a.px,a.py-43);ctx.fill()}}}
function updateMovement(dt){
 actionFlash=Math.max(0,actionFlash-dt);footsteps=footsteps.filter(f=>anim-f.t<1.5);
 if(!path.length){speed=0;return}
 if(blocked(Math.floor(path[0].x),Math.floor(path[0].y))&&moveGoal){let revised=findPath(Math.floor(moveGoal.x),Math.floor(moveGoal.y));if(revised===null){path=[];pending=null;moveGoal=null;speed=0;toast('Lối đi đã thay đổi. Hãy chọn đích mới.');return}path=revised;if(!path.length)return;}
 while(path.length>1&&canWalkSegment(state.player,path[1]))path.shift();
 let remaining=routeLength(path),desired=Math.min(3.8,Math.sqrt(2*10*remaining));speed=Math.min(desired,speed+dt*12);let travel=speed*dt;walkPhase+=travel*2.4;
 while(travel>0&&path.length){let dest=path[0],dx=dest.x-state.player.x,dy=dest.y-state.player.y,d=Math.hypot(dx,dy);
 if(d>.001)facing=Math.abs(dx)>Math.abs(dy)?dx>0?'right':'left':dy>0?'down':'up';
 if(d<=travel+.001){state.player.x=dest.x;state.player.y=dest.y;path.shift();travel-=d}
 else{state.player.x+=dx/d*travel;state.player.y+=dy/d*travel;travel=0}
 }
 let f=footsteps[footsteps.length-1];if(!f||anim-f.t>.13)footsteps.push({x:state.player.x,y:state.player.y,t:anim});
 if(!path.length){speed=0;moveGoal=null;arrival=anim;save();if(pending){let f=pending;pending=null;actionFlash=.65;f()}runNextJob();}
}
function frame(ts){let dt=Math.min((ts-last)/1000,.05);last=ts;anim+=dt;updateMovement(dt);updateVillagers(dt);updateCamera(dt);draw();drawEffects();drawWeather();if(anim-lastStatus>.2){lastStatus=anim;$('#movementStatus').textContent=path.length?'Đang đi'+(jobs.length?' · '+jobs.length+' việc chờ':''):queueMode?'Liên tiếp đang bật · chạm các luống':'Sẵn sàng làm vườn';}requestAnimationFrame(frame)}
initWeather();tickFarm();
$('#weatherButton').onclick=weatherPanel;$('#weatherCard').onclick=weatherPanel;
setInterval(()=>{tickFarm();updateWeatherUI();},1000);setInterval(save,10000);
setInterval(()=>{let changed=false;for(let s of state.staff.filter(s=>s.on)){let p=state.plots.find(p=>s.role==='Người làm vườn'?p.crop&&!ready(p)&&p.moisture<60:ready(p));if(p){if(s.role==='Người làm vườn')waterPlot(p);else harvestPlot(p);changed=true}}if(changed)ui()},8000);
setInterval(()=>{if(state.coop){state.coins+=10;ui()}},20000);
window.addEventListener('pagehide',()=>{tickFarm();save()});if(blocked(Math.floor(state.player.x),Math.floor(state.player.y)))state.player={x:11.5,y:12.5};updateCamera(1);ui();requestAnimationFrame(frame);if(!state.seenCloud2){state.seenCloud2=true;save();setTimeout(()=>toast('Chào mùa mới! Bật Liên tiếp để làm nhiều luống, xem Nhịp mùa để chọn giống.'),800);}
