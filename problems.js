// Explains failures the same way everywhere: what happened, why, and what to do about it.
// Server errors carry a code (e.g. PROVIDER_TIMEOUT); network failures and HTTP statuses are recognised too.
window.Problems=(() => {
 const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const KNOWN={
  OFFLINE:{why:'Your device is offline.',fix:'Reconnect to Wi-Fi or mobile data. Your plan is saved on this device in the meantime.',retry:true},
  NETWORK:{why:'The request didn’t reach the server — usually a weak connection or a blocked network.',fix:'Check your connection and try again.',retry:true},
  TIMEOUT:{why:'The server took too long to answer.',fix:'Try again. If it keeps happening, try a simpler request.',retry:true},
  PROVIDER_TIMEOUT:{why:'Orbit needed more than two minutes, usually because the question needed several web searches.',fix:'Try again, or ask about one day or one place at a time.',retry:true},
  PROVIDER_LIMIT:{why:'The AI service is limiting how fast Orbit can ask it questions.',fix:'Wait about a minute, then try again.',retry:true},
  PROVIDER_AUTH:{why:'The AI service rejected Orbit’s key.',fix:'Check the QWEN_API_KEY / DASHSCOPE_API_KEY secret in Supabase and your infistar balance.'},
  PROVIDER:{why:'The AI service returned an error.',fix:'Try again in a minute. If it keeps failing, check your infistar balance.',retry:true},
  INCOMPLETE:{why:'Orbit started answering but didn’t finish.',fix:'Try again — a shorter question usually works.',retry:true},
  INVALID_RESULT:{why:'Orbit’s answer came back in a form the site couldn’t read.',fix:'Try again.',retry:true},
  NO_SOURCES:{why:'Orbit couldn’t find web pages that confirm the details.',fix:'Add the town to the name (e.g. “大湖”), or enter the details yourself.'},
  BACKEND:{why:'Orbit couldn’t reach the trip database.',fix:'Try again shortly.',retry:true},
  UNEXPECTED:{why:'Something unexpected went wrong on the server.',fix:'Try again. If it keeps happening, tell Claude what you were doing.',retry:true},
  NOT_CONFIGURED:{why:'This feature hasn’t been switched on for the site yet.',fix:'A secret is missing in Supabase → Edge Functions → Secrets.'},
  GOOGLE_AUTH:{why:'Google Maps rejected the key.',fix:'In Google Cloud, check that Places API (New) is enabled, billing is on, and the key is allowed to use it.'},
  GOOGLE_LIMIT:{why:'Google Maps is limiting requests right now.',fix:'Wait a minute and try again.',retry:true},
  GOOGLE_TIMEOUT:{why:'Google Maps took too long to answer.',fix:'Try again.',retry:true},
  GOOGLE:{why:'Google Maps returned an error.',fix:'Try again, or enter the place yourself.',retry:true},
  LIMIT:{why:'The daily allowance for this trip is used up (it keeps the free tiers free).',fix:'Try again tomorrow, or enter details yourself.'},
  ROOM:{why:'This page isn’t opened from your private shared trip link.',fix:'Tap “Turn on Orbit” (or open your shared link) and try again.'}
 };
 // Accepts an Error (with .code/.status), a server reply ({error, code}) or a code string.
 function describe(problem,fallback='Something went wrong.'){
  const offline=typeof navigator!=='undefined'&&navigator.onLine===false;
  const code=offline?'OFFLINE':typeof problem==='string'?problem:problem?.code||(problem?.name==='TimeoutError'||problem?.name==='AbortError'?'TIMEOUT':problem?.message==='Failed to fetch'||problem?.name==='TypeError'?'NETWORK':problem?.status===429?'LIMIT':problem?.status===401?'ROOM':'');
  const known=KNOWN[code]||{};
  const own=typeof problem==='object'&&problem?.message&&!['Failed to fetch'].includes(problem.message)&&problem.name!=='TimeoutError'&&problem.name!=='AbortError'?problem.message:typeof problem?.error==='string'?problem.error:'';
  return {title:offline?'You’re offline.':own||fallback,why:known.why||'',fix:known.fix||'',retry:!!known.retry,code};
 }
 // One block: bold title, then why and what to do. Actions are trusted HTML buttons from the caller.
 function html(p,actions=''){
  return `<div class="problem" role="alert"><strong>${escape(p.title)}</strong>${p.why?`<p><span class="problem-label">Why:</span> ${escape(p.why)}</p>`:''}${p.fix?`<p><span class="problem-label">Try:</span> ${escape(p.fix)}</p>`:''}${actions?`<div class="problem-actions">${actions}</div>`:''}</div>`;
 }
 // Builds an Error that keeps the server's code and status so describe() can explain it.
 function fromResponse(response,data,fallback){
  const e=Error(typeof data?.error==='string'?data.error:fallback);
  e.code=typeof data?.code==='string'&&/^[A-Z_]{2,30}$/.test(data.code)?data.code:response.status===429?'LIMIT':response.status===401?'ROOM':response.status>=500?'UNEXPECTED':'';
  e.status=response.status;return e;
 }
 // Retries once after a short pause when the failure is the kind that often clears up by itself.
 async function withRetry(run,{wait=1500}={}){
  try{return await run()}catch(e){const p=describe(e);if(!p.retry||['PROVIDER_TIMEOUT','TIMEOUT','OFFLINE'].includes(p.code)||e.name==='AbortError')throw e;await new Promise(r=>setTimeout(r,wait));return run()}
 }
 return {describe,html,fromResponse,withRetry};
})();
