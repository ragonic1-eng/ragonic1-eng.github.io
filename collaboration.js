// Versioned shared snapshots: stale edits never silently overwrite a partner's work.
(() => {
  let config,room=null,revision=0,dirty=false,busy=false,conflict=false,suppress=false,version=0,ready=false,timer;
  function status(text){$('collaborationPanel').hidden=false;$('collaborationStatus').textContent=text}
  function publicKey(key){if(key.startsWith('sb_publishable_'))return true;try{return JSON.parse(atob(key.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))).role==='anon'}catch{return false}}
  function auth(){return {Authorization:'Bearer '+room.key,'Content-Type':'application/json'}}
  async function request(action,payload={}){
    if(!config)config=await fetch('config.json').then(r=>{if(!r.ok)throw Error('Sharing configuration is missing.');return r.json()});
    let url,options;
    if(config.provider==='supabase'){
      if(config.supabaseKey&&!publicKey(config.supabaseKey))throw Error('Use a public publishable or anon key. Secret keys cannot be used in a browser.');
      if(!config.supabaseUrl||!config.supabaseKey)throw Error('Shared hosting needs its one-time Supabase setup. Your local plan is safe.');
      if(!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(config.supabaseUrl))throw Error('Invalid Supabase project URL.');
      url=config.supabaseUrl.replace(/\/$/,'')+'/rest/v1/rpc/'+({create:'orbit_create_trip',load:'orbit_load_trip',save:'orbit_save_trip'})[action];
      const body=action==='create'?{p_trip:payload.trip}:action==='load'?{p_id:room.id,p_key:room.key}:{p_id:room.id,p_key:room.key,p_revision:payload.revision,p_trip:payload.trip};
      options={method:'POST',headers:{apikey:config.supabaseKey,'Content-Type':'application/json'},body:JSON.stringify(body)};
    }else{
      url=action==='create'?'api/rooms':'api/rooms/'+room.id;
      options={method:action==='create'?'POST':action==='save'?'PUT':'GET',headers:room?auth():{'Content-Type':'application/json'}};
      if(action!=='load')options.body=JSON.stringify(payload);
    }
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),12000);let response,data;
    try{response=await fetch(url,{...options,signal:controller.signal});data=await response.json()}catch{throw Error('Shared server is unavailable. Your edits remain on this device; retry when connected.')}finally{clearTimeout(timeout)}
    if(response.status===409||data?.conflict)return {...data,conflict:true};
    if(data?.code==='PGRST202')throw Error('The shared database setup is incomplete. Run supabase/setup.sql in the project SQL Editor, then try again.');
    if(!response.ok||data?.error)throw Error(data?.error??data?.message??'Sharing is not configured on this host yet.');
    return data;
  }
  function applyRemote(data){
    validate(data.trip);suppress=true;state=data.trip;revision=data.revision;history=[];persist();render();suppress=false;status('● Shared trip · up to date');$('saveStatus').textContent='● Shared · saved';$('storageMode').textContent='Private shared trip · changes sync between your devices';
  }
  function markConflict(){conflict=true;$('conflictActions').hidden=false;status('Your partner updated this trip while you were editing. Your edits are still here. Export them, then load the latest shared plan.');$('saveStatus').textContent='Changes need review'}
  async function save(){
    if(!room||!dirty||busy||conflict)return;
    busy=true;const savedVersion=version,snapshot=structuredClone(state);
    try{const data=await request('save',{trip:snapshot,revision});if(data.conflict){markConflict();return}revision=data.revision;dirty=version!==savedVersion;try{if(!dirty)localStorage.removeItem('orbit-pending-'+room.id);else localStorage.setItem('orbit-pending-'+room.id,JSON.stringify({revision,trip:state}))}catch{}status(dirty?'Saving latest changes…':'● Shared trip · up to date');$('saveStatus').textContent=dirty?'Syncing…':'● Shared · saved'}catch(e){status(e.message);$('saveStatus').textContent='Saved locally · sync pending'}finally{busy=false;if(dirty&&!conflict)timer=setTimeout(save,3000)}
  }
  window.orbitSync={queue(){if(!ready||!room||suppress)return;dirty=true;version++;try{localStorage.setItem('orbit-pending-'+room.id,JSON.stringify({revision,trip:state}))}catch{}status('Saving your changes to the shared trip…');$('saveStatus').textContent='Syncing…';clearTimeout(timer);timer=setTimeout(save,350)}};
  async function poll(){
    if(!room||busy||conflict||document.hidden||$('editor').open||$('branchEditor').open)return;
    if(dirty)return save();busy=true;const pollVersion=version;
    try{const data=await request('load');if(data.revision!==revision){if($('editor').open||$('branchEditor').open)return;if(dirty||version!==pollVersion){markConflict();return}applyRemote(data)}else status('● Shared trip · up to date')}catch(e){status(e.message)}finally{busy=false}
  }
  $('share').onclick=()=>{if(!ready)return notify('Wait for the trip to finish loading.');$('shareEditor').showModal();$('createShare').hidden=!!room;$('shareLinkArea').hidden=!room;$('shareStatus').textContent=room?'Your private editing link is ready.':'Create a shared copy of the plan currently on this device.';if(room)$('shareLink').value=location.href};
  $('shareClose').onclick=()=>$('shareEditor').close();
  $('createShare').onclick=async()=>{const button=$('createShare');button.disabled=true;$('shareStatus').textContent='Creating your shared trip…';const snapshot=structuredClone(state);try{const data=await request('create',{trip:snapshot});room={id:data.id,key:data.key};revision=data.revision;location.hash=new URLSearchParams({room:room.id,key:room.key}).toString();$('shareLink').value=location.href;$('shareLinkArea').hidden=false;button.hidden=true;$('shareStatus').textContent='Shared trip created. Send this link to your wife.';status('● Shared trip · up to date');$('saveStatus').textContent='● Shared · saved';$('storageMode').textContent='Private shared trip · changes sync between your devices';if(JSON.stringify(snapshot)!==JSON.stringify(state))window.orbitSync.queue()}catch(e){$('shareStatus').textContent=e.message}finally{button.disabled=false}};
  $('copyShare').onclick=async()=>{try{await navigator.clipboard.writeText($('shareLink').value);notify('Private trip link copied')}catch{$('shareLink').select();notify('Select and copy the private link above.')}};
  $('backupDraft').onclick=()=>$('export').click();
  $('loadLatest').onclick=async()=>{if(busy)return;busy=true;try{const data=await request('load');validate(data.trip);try{localStorage.setItem('little-orbit-unsynced-backup',JSON.stringify(state))}catch{}dirty=false;conflict=false;try{localStorage.removeItem('orbit-pending-'+room.id)}catch{}$('conflictActions').hidden=true;applyRemote(data)}catch(e){status(e.message)}finally{busy=false}};
  document.addEventListener('orbit-ready',async()=>{
    const params=new URLSearchParams(location.hash.slice(1));const id=params.get('room'),key=params.get('key');
    if(id&&key){room={id,key};status('Opening your shared trip…');busy=true;setEditingEnabled(false);
      try{const data=await request('load');let pending;try{pending=JSON.parse(localStorage.getItem('orbit-pending-'+room.id))}catch{}if(pending){validate(pending.trip);suppress=true;state=pending.trip;revision=pending.revision;persist();render();suppress=false;dirty=true;if(data.revision!==revision)markConflict();else{ready=true;save()}}else applyRemote(data)}catch(e){status(e.message+' Reload this link to try again.');$('saveStatus').textContent='Shared trip not loaded';room=null;return}finally{busy=false}
    }
    ready=true;setEditingEnabled(true);setInterval(poll,3000);
  });
  function setEditingEnabled(enabled){$('timeline').inert=!enabled;$('days').inert=!enabled;$('library').inert=!enabled;for(const id of ['new','addBottom','fit','start','end','undo','import'])$(id).disabled=!enabled}
  window.addEventListener('beforeunload',e=>{if(room&&dirty){e.preventDefault();e.returnValue=''}});
})();
