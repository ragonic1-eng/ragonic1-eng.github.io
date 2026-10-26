(() => {
 const el=id=>document.getElementById(id),escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const params=new URLSearchParams(location.hash.slice(1)),room=params.get('room'),key=params.get('key'),shared=!!(room&&key);
 const categories={travel:['交通','#648eb8','#dff1ff'],kids:['親子活動','#ad6e99','#fbddee'],food:['用餐','#b57294','#ffe6f2'],hotel:['住宿','#9674b7','#eee2fb'],shopping:['購物','#ac739f','#f7ddf5'],break:['休息','#7f87b2','#e8eaff']};
 let trip,language,config,revision=null,busy=false,selected=0;
 const clock=n=>`${n>=1440?'翌日 ':''}${String(Math.floor(n/60)%24).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;
 const duration=n=>`${n>=60?Math.floor(n/60)+' 小時':''}${n%60?' '+n%60+' 分鐘':''}`.trim();
 function translated(source,custom){if(custom?.trim())return escape(custom.trim());if(Object.hasOwn(language,source))return escape(language[source]);if(!source)return '';return `${escape(source)}${/[a-z]{3}/i.test(source)?'<br><span class="translation-needed">尚無中文翻譯，請與行程安排者確認原文。</span>':''}`}
 function valid(s){return s&&Array.isArray(s.days)&&s.days.length===7&&s.days.every(d=>typeof d.date==='string'&&Number.isInteger(d.start)&&Array.isArray(d.cards)&&d.cards.every(c=>typeof c.title==='string'&&typeof c.notes==='string'&&categories[c.category]&&Number.isInteger(c.duration)&&c.duration>0))}
 function render(){
  const d=trip.days[selected];el('driverDays').innerHTML=trip.days.map((d,i)=>`<button class="day-tab ${selected===i?'active':''}" data-day="${i}" aria-current="${selected===i?'date':'false'}"><span>第 ${i+1} 天</span><b>${escape(d.date.slice(5).replace('-','/'))}</b></button>`).join('');
  el('date').textContent=new Date(d.date+'T12:00:00').toLocaleDateString('zh-TW',{month:'long',day:'numeric',weekday:'long'});
  let start=d.start;el('driverCards').innerHTML=d.cards.map(c=>{const end=start+c.duration,[cat,color,paper]=categories[c.category];const times=`<div class="driver-times"><div><small>開始</small><strong>${clock(start)}</strong></div><div><small>結束</small><strong>${clock(end)}</strong></div><div><small>時長</small><strong>${duration(c.duration)}</strong></div></div>`;start=end;return `<article class="driver-card" style="--cat:${color};--card-bg:${paper}">${times}<h2>${translated(c.title,c.driverTitle)}</h2><span class="driver-category">${cat}${c.optional?' · 備選行程':''}</span>${c.place?PlaceCore.html(c.place,true):''}${c.notes||c.driverNotes?`<details><summary>查看說明</summary><p>${translated(c.notes,c.driverNotes)}</p></details>`:''}</article>`}).join('')||'<p class="driver-empty">今天尚未安排活動。</p>';
 }
 async function json(url,options={}){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);try{const r=await fetch(url,{...options,cache:'no-store',signal:controller.signal});if(!r.ok)throw Error();return await r.json()}finally{clearTimeout(timer)}}
 async function update(){
  if(busy)return;busy=true;el('refresh').disabled=true;
  try{
   language??=await json('driver-zh.json');let next,nextRevision;
   if(shared){
    config??=await json('config.json');let data;
    if(config.provider==='supabase'){if(!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(config.supabaseUrl))throw Error();data=await json(config.supabaseUrl.replace(/\/$/,'')+'/rest/v1/rpc/orbit_load_trip',{method:'POST',headers:{apikey:config.supabaseKey,'Content-Type':'application/json'},body:JSON.stringify({p_id:room,p_key:key})})}
    else data=await json('api/rooms/'+encodeURIComponent(room),{headers:{Authorization:'Bearer '+key}});
    if(data.error)throw Error();next=data.trip;nextRevision=data.revision;
   }else{
    let saved;try{saved=localStorage.getItem('little-orbit-v1')}catch{}
    next=saved?JSON.parse(saved):await json('trip.json');
    if(!saved)for(const d of next.days){let cursor=d.start;const cards=[];for(const c of d.cards){if(c.originalStart>cursor)cards.push({title:'A little breathing room',notes:'',category:'break',duration:c.originalStart-cursor});cards.push(c);cursor=(c.originalStart??cursor)+c.duration}d.cards=cards}
    nextRevision=JSON.stringify(next);
   }
   if(!valid(next))throw Error();
   if(!trip||revision!==nextRevision){trip=next;revision=nextRevision;render()}
   el('sync').textContent=(shared?'已同步共用行程':'本機預覽・尚未共用')+' · 最後確認 '+new Date().toLocaleTimeString('zh-TW',{timeZone:'Asia/Taipei',hour12:false});
   el('copy').disabled=!shared;el('linkHelp').textContent=shared?'每 3 秒檢查更新；回到此頁時立即檢查。請停車後再查看行程。':'這是此裝置的行程預覽。請先在編輯版按「Share trip」建立共用行程，再開啟司機模式，才能分享最新行程。';
  }catch{el('sync').textContent=trip?'無法連線，以下為上次成功載入的行程，可能不是最新版本。恢復連線後會自動重試。':'無法載入行程。請檢查網路及共用連結，再按「重新整理」。';}finally{busy=false;el('refresh').disabled=false}
 }
 el('driverDays').onclick=e=>{const b=e.target.closest('[data-day]');if(b){selected=Number(b.dataset.day);render()}};
 el('refresh').onclick=update;
 el('copy').onclick=async()=>{try{await navigator.clipboard.writeText(location.href);el('linkHelp').textContent='已複製司機連結，可傳送給司機。'}catch{el('linkHelp').textContent='無法自動複製，請複製瀏覽器網址列中的完整連結。'}};
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)update()});window.addEventListener('online',update);window.addEventListener('storage',()=>{if(!shared)update()});setInterval(()=>{if(!document.hidden)update()},3000);update();
})();
