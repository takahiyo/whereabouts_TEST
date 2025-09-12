/* ===== 接続設定 ===== */
/* config.js で REMOTE_ENDPOINT などを定義 */

/* セッションキー */
const SESSION_KEY = "presence-session-token";
const SESSION_ROLE_KEY = "presence-role";
const SESSION_OFFICE_KEY = "presence-office";
const SESSION_OFFICE_NAME_KEY = "presence-office-name";

/* 要素 */
const board=document.getElementById('board'), toastEl=document.getElementById('toast'), diag=document.getElementById('diag');
const loginEl=document.getElementById('login'), loginMsg=document.getElementById('loginMsg'), pwInput=document.getElementById('pw'), officeSel=document.getElementById('officeSel');
const menuEl=document.getElementById('groupMenu'), menuList=document.getElementById('groupMenuList'), menuTitle=document.getElementById('groupMenuTitle'), titleBtn=document.getElementById('titleBtn');
const adminBtn=document.getElementById('adminBtn'), logoutBtn=document.getElementById('logoutBtn'), adminModal=document.getElementById('adminModal'), adminClose=document.getElementById('adminClose');
const adminOfficeRow=document.getElementById('adminOfficeRow'), adminOfficeSel=document.getElementById('adminOfficeSel'), refreshOfficesBtn=document.getElementById('refreshOffices');
const btnExport=document.getElementById('btnExport'), csvFile=document.getElementById('csvFile'), btnImport=document.getElementById('btnImport');
const renameOfficeName=document.getElementById('renameOfficeName'), btnRenameOffice=document.getElementById('btnRenameOffice');
const addOfficeId=document.getElementById('addOfficeId'), addOfficeName=document.getElementById('addOfficeName'), addOfficePw=document.getElementById('addOfficePw'), addOfficeAdminPw=document.getElementById('addOfficeAdminPw'), btnAddOffice=document.getElementById('btnAddOffice');
const btnDeleteOffice=document.getElementById('btnDeleteOffice'), setPw=document.getElementById('setPw'), setAdminPw=document.getElementById('setAdminPw'), btnSetPw=document.getElementById('btnSetPw');
const menusJson=document.getElementById('menusJson'), btnLoadMenus=document.getElementById('btnLoadMenus'), btnSaveMenus=document.getElementById('btnSaveMenus');
const manualBtn=document.getElementById('manualBtn'), manualModal=document.getElementById('manualModal'), manualClose=document.getElementById('manualClose'), manualUser=document.getElementById('manualUser'), manualAdmin=document.getElementById('manualAdmin');
const nameFilter=document.getElementById('nameFilter'), statusFilter=document.getElementById('statusFilter');

/* 状態 */
let GROUPS=[], CONFIG_UPDATED=0, MENUS=null, STATUSES=[], requiresTimeSet=new Set(), clearOnSet=new Set(), statusClassMap=new Map();
let tokenRenewTimer=null, ro=null, remotePullTimer=null, configWatchTimer=null;
let storeKeyBase="presence-board-v4";
const PENDING_ROWS = new Set();

/* 認証状態 */
let SESSION_TOKEN=""; let CURRENT_OFFICE_NAME=""; let CURRENT_OFFICE_ID=""; let CURRENT_ROLE="user";
const enc=new TextEncoder();
function isSuper(){ return CURRENT_ROLE==='superAdmin'; }
function isOfficeAdmin(){ return CURRENT_ROLE==='officeAdmin'; }

/* ユーティリティ */
function toast(msg,ok=true){ toastEl.style.background=ok?'#334155':'#c53030'; toastEl.textContent=msg; toastEl.classList.add('show'); setTimeout(()=>toastEl.classList.remove('show'),2000); }
function diagAdd(line){
  diag.classList.add('show');
  const div=document.createElement('div');
  div.textContent=line;
  diag.appendChild(div);
}
function stripCtl(s){ return (s==null?'':String(s)).replace(/[\u0000-\u001F\u007F]/g,''); }
function sanitizeText(s){
  s = stripCtl(s);

  return s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
const ID_RE=/^[0-9A-Za-z_-]+$/;

function el(tag,attrs={},children=[]){ const e=document.createElement(tag); for(const [k,v] of Object.entries(attrs||{})){ if(v==null) continue; if(k==='class') e.className=v; else if(k==='text') e.textContent=String(v); else e.setAttribute(k,String(v)); } (children||[]).forEach(c=>e.appendChild(typeof c==='string'?document.createTextNode(c):c)); return e; }
function qsEncode(obj){ const p=new URLSearchParams(); Object.entries(obj||{}).forEach(([k,v])=>{ if(v==null) return; p.append(k,String(v)); }); return p.toString(); }
async function apiPost(params,timeout=20000){ const controller=new AbortController(); const t=setTimeout(()=>controller.abort(),timeout); try{ const res=await fetch(REMOTE_ENDPOINT,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:qsEncode(params),signal:controller.signal,credentials:'omit',cache:'no-store'}); const ct=(res.headers.get('content-type')||'').toLowerCase(); if(!ct.includes('application/json')) return {ok:false,error:'invalid_content_type'}; return await res.json(); }catch(err){ console.error(err); return {ok:false,error:err}; } finally{ clearTimeout(t); }}
/* セッションメタ(F5耐性) */
function saveSessionMeta(){ try{ sessionStorage.setItem(SESSION_ROLE_KEY,CURRENT_ROLE||'user'); sessionStorage.setItem(SESSION_OFFICE_KEY,CURRENT_OFFICE_ID||''); sessionStorage.setItem(SESSION_OFFICE_NAME_KEY,CURRENT_OFFICE_NAME||''); }catch{} }
function loadSessionMeta(){ try{ CURRENT_ROLE=sessionStorage.getItem(SESSION_ROLE_KEY)||'user'; CURRENT_OFFICE_ID=sessionStorage.getItem(SESSION_OFFICE_KEY)||''; CURRENT_OFFICE_NAME=sessionStorage.getItem(SESSION_OFFICE_NAME_KEY)||''; }catch{} }

/* レイアウト（JS + CSS両方で冗長に制御） */
const PANEL_MIN_PX=760,GAP_PX=20,MAX_COLS=3;
const CARD_BREAKPOINT_PX=760; // これより狭い幅ではカード表示を強制
function getContainerWidth(){ const elc=board.parentElement||document.body; const r=elc.getBoundingClientRect(); return Math.max(0,Math.round(r.width)); }
function updateCols(){
  const w = getContainerWidth();
  let n = Math.floor((w + GAP_PX) / (PANEL_MIN_PX + GAP_PX));
  if (n < 2) {
    board.classList.add('force-cards');
    board.dataset.cols = '1';
    board.style.removeProperty('--cols');
    return;
  }
  if (n > MAX_COLS) n = MAX_COLS;
  board.style.setProperty('--cols', String(n));
  board.dataset.cols = String(n);
  board.classList.remove('force-cards');
}
function startGridObserver(){
  if(ro){
    ro.disconnect();
    ro=null;
  }
  window.removeEventListener('resize', updateCols);
  if(typeof ResizeObserver!=='undefined'){
    ro=new ResizeObserver(updateCols);
    ro.observe(board.parentElement||document.body);
  }else{
    window.addEventListener('resize', updateCols, {passive:true});
  }
  updateCols();
}

/* === フィルタ === */
function buildStatusFilterOptions(){
  statusFilter.replaceChildren();
  const optAll = document.createElement('option'); optAll.value=''; optAll.textContent='（全てのステータス）';
  statusFilter.appendChild(optAll);
  (MENUS?.statuses||[]).forEach(s=>{
    const o=document.createElement('option');
    o.value=String(s.value); o.textContent=String(s.value);
    statusFilter.appendChild(o);
  });
}
function applyFilters(){
  const q=(nameFilter.value||'').trim().toLowerCase();
  const st=statusFilter.value||'';
  board.querySelectorAll('section.panel').forEach(sec=>{
    let anyRow=false;
    sec.querySelectorAll('tbody tr').forEach(tr=>{
      const nameCell=tr.querySelector('td.name');
      const nameText=(nameCell?.textContent||'').toLowerCase();
      const rowSt = tr.querySelector('select[name="status"]')?.value || '';
      const showByName = !q || nameText.includes(q);
      const showByStatus = !st || rowSt === st;
      const show = showByName && showByStatus;
      tr.style.display = show ? '' : 'none';
      if(show) anyRow=true;
    });
    // F6相当：該当行が無いパネルは隠す
    sec.style.display = anyRow ? '' : 'none';
  });
}
nameFilter.addEventListener('input', applyFilters);
statusFilter.addEventListener('change', applyFilters);

function updateStatusFilterCounts(){
  // 現在の人数（全件）を集計
  const totalRows = board.querySelectorAll('tbody tr').length;
  const counts = new Map();
  STATUSES.forEach(s=>counts.set(s.value,0));
  board.querySelectorAll('tbody tr').forEach(tr=>{
    const st = tr.dataset.status || tr.querySelector('select[name="status"]')?.value || "";
    if(!counts.has(st)) counts.set(st,0);
    counts.set(st, counts.get(st)+1);
  });
  const cur = statusFilter.value;
  statusFilter.innerHTML = '';
  const optAll = document.createElement('option');
  optAll.value = ''; optAll.textContent = `全て（${totalRows}）`;
  statusFilter.appendChild(optAll);
  STATUSES.forEach(s=>{
    const o=document.createElement('option');
    o.value=s.value; o.textContent=`${s.value}（${counts.get(s.value)||0}）`;
    statusFilter.appendChild(o);
  });
  statusFilter.value = (cur==='' || STATUSES.some(x=>x.value===cur)) ? cur : '';
}

/* === 時刻メニュー（07:00〜22:00） === */
const TIME_RANGE_START_MIN = 7*60;  // 07:00
const TIME_RANGE_END_MIN   = 22*60; // 22:00
function buildTimeOptions(stepMin){
  const frag=document.createDocumentFragment();
  frag.appendChild(el('option',{value:"",text:""}));
  const step=Math.max(5,Math.min(60,Number(stepMin||30)));
  for(let m=TIME_RANGE_START_MIN; m<=TIME_RANGE_END_MIN; m+=step){
    const h=Math.floor(m/60), mm=m%60;
    const t=`${String(h).padStart(2,'0')}:${String(mm).padStart(2,'0')}`;
    frag.appendChild(el('option',{value:t,text:t}));
  }
  return frag;
}

/* 行UI */
function buildRow(member){
  const name=sanitizeText(member.name||"");
  const ext=(member.ext&&/^[0-9]{1,4}$/.test(String(member.ext)))?String(member.ext):"";
  const key=member.id;
  const tr=el('tr',{id:`row-${key}`}); tr.dataset.key=key; tr.dataset.rev='0';

  const tdName=el('td',{class:'name','data-label':'氏名'}); tdName.textContent=name;

  const tdExt=el('td',{class:'ext','data-label':'内線'},[ext]); /* 表示のみ */

  const tdStatus=el('td',{class:'status','data-label':'ステータス'});
  const selStatus=el('select',{id:`status-${key}`,name:'status'});
  tdStatus.appendChild(el('label',{class:'sr-only',for:`status-${key}`,text:'ステータス'}));
  STATUSES.forEach(s=> selStatus.appendChild(el('option',{value:s.value,text:s.value})));
  tdStatus.appendChild(selStatus);

  const tdTime=el('td',{class:'time','data-label':'戻り時間'});
  const selTime=el('select',{id:`time-${key}`,name:'time'});
  tdTime.appendChild(el('label',{class:'sr-only',for:`time-${key}`,text:'戻り時間'}));
  selTime.appendChild(buildTimeOptions(MENUS?.timeStepMinutes)); tdTime.appendChild(selTime);

  const tdNote=el('td',{class:'note','data-label':'備考'});
  const inpNote=el('input',{id:`note-${key}`,name:'note',type:'text',list:'noteOptions',placeholder:'備考'});
  tdNote.appendChild(inpNote);

  tr.append(tdName,tdExt,tdStatus,tdTime,tdNote);
  return tr;
}

/* 既存行の自己修復 */
function ensureRowControls(tr){
  if(!tr) return;
  const key=tr.dataset.key;
  let s=tr.querySelector('td.status select');
  if(!s){
    const td=tr.querySelector('td.status');
    s=el('select',{id:`status-${key}`,name:'status'});
    STATUSES.forEach(x=>s.appendChild(el('option',{value:x.value,text:x.value})));
    td && td.appendChild(s);
    diagAdd('fix: status select injected');
  }
  let t=tr.querySelector('td.time select');
  if(!t){
    const td=tr.querySelector('td.time');
    t=el('select',{id:`time-${key}`,name:'time'});
    t.appendChild(buildTimeOptions(MENUS?.timeStepMinutes));
    td && td.appendChild(t);
    diagAdd('fix: time select injected');
  }
  const noteInp=tr.querySelector('input[name="note"]');
  if(noteInp && noteInp.getAttribute('list')!=='noteOptions'){
    noteInp.setAttribute('list','noteOptions');
    diagAdd('fix: note datalist reattached');
  }
}

/* 描画 */
function buildPanel(group, idx){
  const gid=`grp-${idx}`; const sec=el('section',{class:'panel',id:gid}); sec.dataset.groupIndex=String(idx);
  const title=fallbackGroupTitle(group, idx); sec.appendChild(el('h3',{class:'title',text:title}));
  const table=el('table',{'aria-label':`在席表（${title}）`});
  table.appendChild(el('colgroup',{},[
    el('col',{class:'col-name'}),
    el('col',{class:'col-ext'}),
    el('col',{class:'col-status'}),
    el('col',{class:'col-time'}),
    el('col',{class:'col-note'})
  ]));
  const thead=el('thead'); const thr=el('tr'); ['氏名','内線','ステータス','戻り時間','備考'].forEach(h=>thr.appendChild(el('th',{text:h}))); thead.appendChild(thr); table.appendChild(thead);
  const tbody=el('tbody'); group.members.forEach(m=>{ const r=buildRow(m); tbody.appendChild(r); }); table.appendChild(tbody);
  sec.appendChild(table); return sec;
}
function render(){
  board.replaceChildren();
  GROUPS.forEach((g,i)=> board.appendChild(buildPanel(g,i)));
  board.style.display='';
  // 自己修復
  board.querySelectorAll('tbody tr').forEach(ensureRowControls);
  wireEvents(); loadLocal(); recolor();
  try {
    startGridObserver();
  } catch (e) {
    console.error(e);
  } finally {
    buildGroupMenu();
    updateCols();
  }
  buildStatusFilterOptions(); updateStatusFilterCounts();
  applyFilters();
}

/* グループメニュー */
function buildGroupMenu(){
  menuList.replaceChildren();
  if(!Array.isArray(GROUPS)) return;
  const total = (GROUPS||[]).reduce((s,g)=> s+((g.members&&g.members.length)||0),0);
  menuTitle.textContent='グループにジャンプ';
  menuList.appendChild(el('li',{},[el('button',{class:'grp-item','role':'menuitem','data-target':'top',text:`全体（合計：${total}名）`})]));
  GROUPS.forEach((g,i)=>{ const title=fallbackGroupTitle(g,i); const sub=(g&&g.members&&g.members.length)?`（${g.members.length}名）`:'（0名）'; menuList.appendChild(el('li',{},[el('button',{class:'grp-item','role':'menuitem','data-target':`grp-${i}`},[title,el('span',{class:'muted',text:` ${sub}`})])]))});
  menuList.querySelectorAll('button.grp-item').forEach(btn=> btn.addEventListener('click',()=>{ const id=btn.getAttribute('data-target'); closeMenu(); if(id==='top'){ window.scrollTo({top:0,behavior:'smooth'}); return; } const sec=document.getElementById(id); if(sec) sec.scrollIntoView({behavior:'smooth',block:'start'}); }));
}
function openMenu(){ menuEl.classList.add('show'); titleBtn.setAttribute('aria-expanded','true'); }
function closeMenu(){ menuEl.classList.remove('show'); titleBtn.setAttribute('aria-expanded','false'); }
function toggleMenu(){ menuEl.classList.contains('show')?closeMenu():openMenu(); }
titleBtn.addEventListener('click',(e)=>{ e.stopPropagation(); toggleMenu(); });
document.addEventListener('click',(e)=>{ if(menuEl.classList.contains('show')){ const within=menuEl.contains(e.target)||titleBtn.contains(e.target); if(!within) closeMenu(); }});
document.addEventListener('keydown',(e)=>{ if(e.key==='Escape') closeMenu(); });

/* 行状態 */
function getRowStateByTr(tr){
  if(!tr) return {ext:"",status:STATUSES[0]?.value||"在席",time:"",note:""};
  return {
    ext: tr.querySelector('td.ext')?.textContent.trim() || "",
    status: tr.querySelector('select[name="status"]').value,
    time: tr.querySelector('select[name="time"]').value,
    note: tr.querySelector('input[name="note"]').value
  };
}
function getRowState(id){ return getRowStateByTr(document.getElementById(`row-${id}`)); }
function getState(){ const data={}; board.querySelectorAll("tbody tr").forEach(tr=>{ data[tr.dataset.key]=getRowStateByTr(tr); }); return data; }

/* 編集適用 */
function isEditingField(el){ return !!(el&&((el.dataset&&el.dataset.editing==='1')||(el.dataset&&el.dataset.composing==='1')||el===document.activeElement)); }
function setIfNeeded(el,v){ if(!el) return; if(isEditingField(el)) return; if(el.value!==(v??"")) el.value=v??""; }
function applyState(data){
  if(!data) return;
  Object.entries(data).forEach(([k,v])=>{
    if (PENDING_ROWS.has(k)) return;

    const tr=document.getElementById(`row-${k}`);
    const s=tr?.querySelector('select[name="status"]'), t=tr?.querySelector('select[name="time"]'), n=tr?.querySelector('input[name="note"]');
    if(!tr || !s || !t){ ensureRowControls(tr); }
    if(v.status && STATUSES.some(x=>x.value===v.status)) setIfNeeded(s,v.status);
    setIfNeeded(t,v.time||""); setIfNeeded(n,v.note||"");
    if(s&&t) toggleTimeEnable(s,t);

    // rev/serverUpdated 反映（無ければ0扱い）
    const remoteRev = Number(v.rev || 0);
    const localRev  = Number(tr?.dataset.rev || 0);
    if(tr && remoteRev > localRev){ tr.dataset.rev = String(remoteRev); tr.dataset.serverUpdated = String(v.serverUpdated || 0); }

    ensureTimePrompt(tr);
  });
  recolor();
  updateStatusFilterCounts();
  applyFilters();
}
function recolor(){ board.querySelectorAll("tbody tr").forEach(tr=>{ const st=tr.querySelector('select[name="status"]')?.value||""; statusClassMap.forEach(cls=>tr.classList.remove(cls)); const cls=statusClassMap.get(st); if(cls) tr.classList.add(cls); tr.dataset.status=st; }); }
function toggleTimeEnable(statusEl,timeEl){ const needsTime=requiresTimeSet.has(statusEl.value); if(timeEl) timeEl.disabled=!needsTime; }
function ensureTimePrompt(tr){
  if(!tr) return;
  const statusEl = tr.querySelector('select[name="status"]');
  const timeTd   = tr.querySelector('td.time');
  const timeEl   = tr.querySelector('select[name="time"]');
  if(!(statusEl && timeTd && timeEl)) return;
  const needs = requiresTimeSet.has(statusEl.value);
  const empty = !timeEl.value;
  if(needs && empty){
    timeTd.classList.add('need-time');
    timeEl.setAttribute('aria-invalid','true');
    let hint = timeTd.querySelector('.time-hint');
    if(!hint){ hint = document.createElement('span'); hint.className = 'time-hint'; hint.textContent = '戻り時間を選択'; timeTd.appendChild(hint); }
  }else{
    timeTd.classList.remove('need-time');
    timeEl.removeAttribute('aria-invalid');
    const hint = timeTd.querySelector('.time-hint'); if(hint) hint.remove();
  }
}

/* ローカル保存 */
function localKey(){ return `${storeKeyBase}:${CURRENT_OFFICE_ID||'__none__'}:${CONFIG_UPDATED||0}`; }
function saveLocal(){ try{ localStorage.setItem(localKey(), JSON.stringify(getState())); }catch{} }
function loadLocal(){ try{ const raw=localStorage.getItem(localKey()); if(raw) applyState(JSON.parse(raw)); }catch{} }

/* 同期（行ごとデバウンス送信） */
const noteTimers=new Map();
function debounceRowPush(key,delay=900){ PENDING_ROWS.add(key); if(noteTimers.has(key)) clearTimeout(noteTimers.get(key)); noteTimers.set(key,setTimeout(()=>{ noteTimers.delete(key); pushRowDelta(key); },delay)); }
      
/* ===== メニュー・正規化・通信・同期 ===== */
function defaultMenus(){
  return {
    timeStepMinutes: 30,
    statuses: [
      { value: "在席",         class: "st-here",    clearOnSet: true  },
      { value: "外出",         requireTime: true,   class: "st-out"   },
      { value: "会議",         requireTime: true,   class: "st-meeting" },
      { value: "テレワーク",   class: "st-remote",  clearOnSet: true  },
      { value: "休み",         class: "st-off",     clearOnSet: true  }
    ],
    noteOptions: ["直出","直帰","直出・直帰"]
  };
}
function setupMenus(m){
  MENUS = m || defaultMenus();
  const sts = Array.isArray(MENUS.statuses) ? MENUS.statuses : defaultMenus().statuses;

  STATUSES = sts.map(s => ({ value: String(s.value) }));
  requiresTimeSet = new Set(sts.filter(s => s.requireTime).map(s => String(s.value)));
  clearOnSet       = new Set(sts.filter(s => s.clearOnSet).map(s => String(s.value)));
  statusClassMap   = new Map(sts.map(s => [String(s.value), String(s.class || "")]));

  // 備考候補 datalist（先頭は空白のラベル付き）
  let dl = document.getElementById('noteOptions');
  if(!dl){ dl = document.createElement('datalist'); dl.id = 'noteOptions'; document.body.appendChild(dl); }
  dl.replaceChildren();
  const optBlank = document.createElement('option'); optBlank.value = ""; optBlank.label = "（空白）"; optBlank.textContent = "（空白）"; dl.appendChild(optBlank);
  (MENUS.noteOptions || []).forEach(t => { const opt = document.createElement('option'); opt.value = String(t); dl.appendChild(opt); });

  buildStatusFilterOptions();
}
function isNotePresetValue(val){
  const v=(val==null?"":String(val)).trim();
  if(v==="") return true;
  const set = new Set((MENUS?.noteOptions||[]).map(x=>String(x)));
  return set.has(v);
}
function fallbackGroupTitle(g, idx){
  const t = (g && g.title != null) ? String(g.title).trim() : "";
  return t || `グループ${idx + 1}`;
}
function normalizeConfigClient(cfg){
  const groups = (cfg && Array.isArray(cfg.groups)) ? cfg.groups : [];
  return groups.map(g => {
    const members = Array.isArray(g.members) ? g.members : [];
    return {
      title: g.title || "",
      members: members.map(m => ({
        id:    String(m.id ?? "").trim(),
        name:  String(m.name ?? ""),
        ext:   String(m.ext  ?? "")
      })).filter(m => m.id || m.name)
    };
  });
}
async function fastFetchDataOnce(){
  return await apiPost({ action: 'get', token: SESSION_TOKEN, nocache: '1' });
}
function startRemoteSync(immediate){
  if(remotePullTimer){ clearInterval(remotePullTimer); remotePullTimer = null; }
  if(immediate){ fastFetchDataOnce().then(r => { if(r && r.data) applyState(r.data); }).catch(()=>{}); }
  remotePullTimer = setInterval(async ()=>{
    const r = await apiPost({ action:'get', token: SESSION_TOKEN });
    if(r && r.data) applyState(r.data);
  }, REMOTE_POLL_MS);
}
function startConfigWatch(){
  if(configWatchTimer){ clearInterval(configWatchTimer); configWatchTimer = null; }
  configWatchTimer = setInterval(async ()=>{
    const cfg = await apiPost({ action:'getConfig', token: SESSION_TOKEN, nocache:'1' });
    if(cfg && !cfg.error){
      const updated = (typeof cfg.updated === 'number') ? cfg.updated : 0;
      if(updated && updated !== CONFIG_UPDATED){
        GROUPS = normalizeConfigClient(cfg);
        CONFIG_UPDATED = updated;
        setupMenus(cfg.menus || null);
        render();
      }
    }
  }, CONFIG_POLL_MS);
}
function scheduleRenew(ttlMs){
  if(tokenRenewTimer) { clearTimeout(tokenRenewTimer); tokenRenewTimer = null; }
  const delay = Math.max(10_000, Number(ttlMs||TOKEN_DEFAULT_TTL) - 60_000);
  tokenRenewTimer = setTimeout(async ()=>{
    const me = await apiPost({ action: 'renew', token: SESSION_TOKEN });
    if(me && me.ok){
      CURRENT_ROLE = me.role || CURRENT_ROLE;
      saveSessionMeta();
      scheduleRenew(Number(me.exp) || TOKEN_DEFAULT_TTL);
    }
  }, delay);
}

/* 送信（CAS: baseRev 同梱） */
async function pushRowDelta(key){
  const tr = document.getElementById(`row-${key}`);
  try{
    if(!tr) return;
    const st = getRowState(key);
    const baseRev = {}; baseRev[key] = Number(tr.dataset.rev || 0);
    const payload = { updated: Date.now(), data: { [key]: st } };
    const r = await apiPost({ action:'set', token: SESSION_TOKEN, data: JSON.stringify(payload), baseRev: JSON.stringify(baseRev) });

    if(!r){ toast('通信エラー', false); return; }

    if(r.error === 'conflict'){
      // サーバ側の値で上書き
      const c = (r.conflicts && r.conflicts.find(x=>x.id===key)) || null;
      if(c && c.server){
        applyState({ [key]: c.server });
        toast('他端末と競合しました（サーバ値で更新）', false);
      }else{
        // 競合配列が無い場合でも rev マップがあれば反映
        const rev = Number((r.rev && r.rev[key]) || 0);
        const ts  = Number((r.serverUpdated && r.serverUpdated[key]) || 0);
        if(rev){ tr.dataset.rev = String(rev); tr.dataset.serverUpdated = String(ts||0); }
        saveLocal();
      }
      return;
    }
        
    if(!r.error){
      const rev = Number((r.rev && r.rev[key]) || 0);
      const ts  = Number((r.serverUpdated && r.serverUpdated[key]) || 0);
      if(rev) { tr.dataset.rev = String(rev); tr.dataset.serverUpdated = String(ts||0); }
      saveLocal();
      return;
    }

    toast('保存に失敗しました', false);
  }finally{
    PENDING_ROWS.delete(key);
    if(tr){ const n=tr.querySelector('input[name="note"]'); if(n) delete n.dataset.editing; }
  }

}

/* 入力イベント（IME配慮・デバウンス） */
function wireEvents(){
  // IME対策
  board.addEventListener('compositionstart', e => { const t=e.target; if(t && t.dataset) t.dataset.composing='1'; });
  board.addEventListener('compositionend',   e => { const t=e.target; if(t && t.dataset) delete t.dataset.composing; });

  board.addEventListener('focusin',  e => { const t=e.target; if(t && t.dataset) t.dataset.editing='1'; });
  board.addEventListener('focusout', e => {
    const t=e.target;
    if(!(t && t.dataset)) return;
    const tr=t.closest('tr');
    const key=tr?.dataset.key;
    if(t.name==='note' && key && PENDING_ROWS.has(key)){ t.dataset.editing='1'; }
    else{ delete t.dataset.editing; }
  });
  // 入力（備考：入力中は自動更新停止 → setIfNeeded が弾く）
  board.addEventListener('input', (e)=>{
    const t = e.target;
    if(!(t && t.name)) return;
    const tr = t.closest('tr'); if(!tr) return;
    const key = tr.dataset.key;
    if(t.name === 'note'){ debounceRowPush(key); }
  });

  // 変更（ステータス/時間）
  board.addEventListener('change', (e)=>{
    const t = e.target;
    if(!t) return;
    const tr = t.closest('tr'); if(!tr) return;
    const key = tr.dataset.key;

    if(t.name === 'status'){
      const timeSel = tr.querySelector('select[name="time"]');
      const noteInp = tr.querySelector('input[name="note"]');
      toggleTimeEnable(t, timeSel);

      if(clearOnSet.has(t.value)){
        if(timeSel) timeSel.value = '';
        if(noteInp && isNotePresetValue(noteInp.value)){ noteInp.value = ''; }
      }

      ensureTimePrompt(tr);
      recolor();
      updateStatusFilterCounts();
      debounceRowPush(key);
      return;
    }

    if(t.name === 'time'){
      ensureTimePrompt(tr);
      debounceRowPush(key);
      return;
    }
  });
}

/* 重要操作の再認証（HMAC+Nonce） */
async function getNonce(){ const r=await apiPost({ action:'getNonce' }); if(!r||!r.nonce||!r.salt) throw new Error('nonce_failed'); return {nonce:r.nonce, salt:r.salt}; }
function toBase64(buf){
  const bin=String.fromCharCode(...new Uint8Array(buf));
  return btoa(bin).replace(/\+/g,'-').replace(/\//g,'_');
}
function hexToBytes(hex){
  if(hex.length%2!==0) throw new Error('invalid_hex');
  const bytes=new Uint8Array(hex.length/2);
  for(let i=0;i<bytes.length;i++){
    bytes[i]=parseInt(hex.substr(i*2,2),16);
  }
  return bytes;
}
async function sha256Bytes(str){ return await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str)); }
async function hmacSha256(keyBytes,messageBytes){ const key=await crypto.subtle.importKey('raw',keyBytes,{name:'HMAC',hash:'SHA-256'},false,['sign']); const sig=await crypto.subtle.sign('HMAC',key,messageBytes); return sig; }
async function superHmacFlow(title){ try{ const pw=window.prompt(title||'スーパー管理者パスワード'); if(!pw) return null; const {nonce,salt}=await getNonce(); const kBytes=await sha256Bytes(salt+pw); const sig=await hmacSha256(kBytes,hexToBytes(nonce)); return { hmac: toBase64(sig), nonce }; }catch{ toast('追加認証に失敗',false); return null; }}

/* 管理UIイベント */
btnExport.addEventListener('click', async ()=>{
  const office=selectedOfficeId();
  const cfg=await adminGetConfigFor(office);
  const dat=await adminGetFor(office);
  if(!(cfg&&cfg.groups) || !(dat&&typeof dat.data==='object')){ toast('エクスポート失敗',false); return; }
  const csv=makeNormalizedCSV(cfg,dat.data);
  const BOM=new Uint8Array([0xEF,0xBB,0xBF]);
  const bytes=new TextEncoder().encode(csv);
  const blob=new Blob([BOM,bytes],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url; a.download=`presence_${office}.csv`;
  document.body.appendChild(a); a.click();
  setTimeout(()=>{ URL.revokeObjectURL(url); a.remove(); },0);
});
btnImport.addEventListener('click', async ()=>{
  const office=selectedOfficeId();
  const file=csvFile.files&&csvFile.files[0];
  if(!file){ toast('CSVを選択してください',false); return; }
  let proof=null;
  if(isSuper()){
    proof=await superHmacFlow("CSVインポートを実行します。スーパー管理者パスワードを入力してください");
    if(!proof) return;
  }
  const text=await file.text();
  const rows=parseCSV(text);
  if(!rows.length){ toast('CSVが空です',false); return; }
  const hdr=rows[0].map(s=>s.trim());
  const mustEn=['group_index','group_title','member_order','id','name','ext','status','time','note'];
  const mustJa=['グループ番号','グループ名','表示順','id','氏名','内線','ステータス','戻り時間','備考'];
  const okEn = mustEn.every((h,i)=>hdr[i]===h);
  const okJa = mustJa.every((h,i)=>hdr[i]===h);
  if(!okEn && !okJa){ toast('CSVヘッダが不正です',false); return; }

  const recs=rows.slice(1).filter(r=>r.some(x=>(x||'').trim()!=='')).map(r=>{
    const [gi,gt,mi,id,name,ext,status,time,note]=r;
    return {gi:Number(gi)||0,gt:(gt||''),mi:Number(mi)||0,id:(id||''),name:(name||''),ext:(ext||''),status:(status||(STATUSES[0]?.value||'在席')),time:(time||''),note:(note||'')};
  });

  const groupsMap=new Map();
  for(const r of recs){
    if(!r.gi||!r.mi||!r.name) continue;
    if(!groupsMap.has(r.gi)) groupsMap.set(r.gi,{title:r.gt||'',members:[]});
    const g=groupsMap.get(r.gi);
    g.title=r.gt||'';
    g.members.push({_mi:r.mi,name:r.name,ext:r.ext||'',id:r.id||undefined});
  }
  const groups=Array.from(groupsMap.entries()).sort((a,b)=>a[0]-b[0]).map(([gi,g])=>{ g.members.sort((a,b)=>(a._mi||0)-(b._mi||0)); g.members.forEach(m=>delete m._mi); return g; });
  const cfgToSet={version:2,updated:Date.now(),groups,menus:MENUS||undefined};
  const r1=await adminSetConfigFor(office,cfgToSet,proof);
  if(!(r1&&r1.ok)){ toast('名簿の設定に失敗',false); return; }

  const newCfg=await adminGetConfigFor(office);
  if(!(newCfg&&newCfg.groups)){ toast('名簿再取得に失敗',false); return; }

  const keyOf=(gi,gt,mi,name,ext)=>[String(gi),String(gt||''),String(mi),String(name||''),String(ext||'')].join('|');
  const idIndex=new Map();
  (newCfg.groups||[]).forEach((g,gi0)=>{ (g.members||[]).forEach((m,mi0)=>{ idIndex.set(keyOf(gi0+1,g.title||'',mi0+1,m.name||'',m.ext||''),m.id); }); });

  const dataObj={};
  for(const r of recs){
    const id=r.id || idIndex.get(keyOf(r.gi,r.gt,r.mi,r.name,r.ext||'')) || null;
    if(!id) continue;
    dataObj[id]={ ext:r.ext||'', status: STATUSES.some(s=>s.value===r.status)? r.status : (STATUSES[0]?.value||'在席'), time:r.time||'', note:r.note||'' };
  }
  const r2=await adminSetForChunked(office,dataObj,proof);
  if(!(r2&&r2.ok)){ toast('在席データ更新に失敗',false); return; }
  toast('インポート完了',true);
});
btnRenameOffice.addEventListener('click', async ()=>{
  const office=selectedOfficeId();
  const name=(renameOfficeName.value||'').trim();
  if(!name){ toast('新しい拠点名を入力',false); return; }
  const r=await adminRenameOffice(office,name);
  if(r&&r.ok){ toast('拠点名を変更しました'); await populateAdminOffices(office); }
  else toast('変更に失敗',false);
});
btnAddOffice.addEventListener('click', async ()=>{
  const id=(addOfficeId.value||'').trim();
  const name=(addOfficeName.value||'').trim();
  const pw=(addOfficePw.value||'').trim();
  const apw=(addOfficeAdminPw.value||'').trim();
  if(!id||!name||!pw||!apw){ toast('すべて入力してください',false); return; }
  const r=await adminAddOffice(id,name,pw,apw);
  if(r&&r.ok){ toast('拠点を追加しました'); addOfficeId.value=''; addOfficeName.value=''; addOfficePw.value=''; addOfficeAdminPw.value=''; await populateAdminOffices(id); }
  else toast('追加に失敗',false);
});
btnDeleteOffice.addEventListener('click', async ()=>{
  if(!isSuper()){ toast('権限がありません',false); return; }
  const office=adminOfficeSel.value;
  const officeLabel=adminOfficeSel.options[adminOfficeSel.selectedIndex]?.text||office;
  const proof=await superHmacFlow(`拠点を削除します。\n対象：${officeLabel}\nスーパー管理者パスワードを入力してください`);
  if(!proof) return;
  const r=await adminDeleteOffice(office,proof);
  if(r&&r.ok){ toast('拠点を削除しました',true); await populateAdminOffices(); }
  else toast('削除に失敗',false);
});
btnSetPw.addEventListener('click', async ()=>{
  const office=selectedOfficeId();
  const pw=(setPw.value||'').trim();
  const apw=(setAdminPw.value||'').trim();
  if(!pw&&!apw){ toast('更新する項目を入力',false); return; }
  let proof=null;
  if(isSuper()){
    proof=await superHmacFlow("拠点パスワードを変更します。スーパー管理者パスワードを入力してください");
    if(!proof) return;
  }
  const r=await adminSetOfficePassword(office,pw,apw,proof);
  if(r&&r.ok){ toast('パスワードを更新しました'); setPw.value=''; setAdminPw.value=''; }
  else toast('更新に失敗',false);
});
btnLoadMenus.addEventListener('click', async ()=>{
  const office=selectedOfficeId();
  const cfg=await adminGetConfigFor(office);
  menusJson.value=JSON.stringify((cfg&&cfg.menus)||defaultMenus(),null,2);
});
btnSaveMenus.addEventListener('click', async ()=>{
  let obj;
  try{ obj=JSON.parse(menusJson.value); }catch{ toast('JSONの形式が不正です',false); return; }
  const office=selectedOfficeId();
  const cfg=await adminGetConfigFor(office);
  if(!(cfg&&cfg.groups)){ toast('名簿の取得に失敗',false); return; }
  let proof=null;
  if(isSuper()){
    proof=await superHmacFlow("メニュー設定を保存します。スーパー管理者パスワードを入力してください");
    if(!proof) return;
  }
  cfg.menus=obj;
  const r=await adminSetConfigFor(office,cfg,proof);
  if(r&&r.ok){ toast('メニュー設定を保存しました'); setupMenus(cfg.menus); render(); }
  else toast('保存に失敗',false);
});

/* CSVパーサ */
function parseCSV(text){
  const out=[]; let i=0,row=[],field='',inq=false;
  function pushField(){ row.push(field); field=''; }
  function pushRow(){ out.push(row); row=[]; }
  while(i<text.length){
    const c=text[i++];
    if(inq){
      if(c=='"'&&text[i]=='"'){ field+='"'; i++; }
      else if(c=='"'){ inq=false; }
      else field+=c;
    } else {
      if(c===','){ pushField(); }
      else if(c=='"'){ inq=true; }
      else if(c=='\n'){ pushField(); pushRow(); }
      else if(c=='\r'){ }
      else field+=c;
    }
  }
  if(field!=='') pushField();
  if(row.length) pushRow();
  return out;
}

/* ログアウト */
async function logout(){
  try{
    if(tokenRenewTimer){ clearTimeout(tokenRenewTimer); tokenRenewTimer=null; }
    if(configWatchTimer){ clearInterval(configWatchTimer); configWatchTimer=null; }
    if(remotePullTimer){ clearInterval(remotePullTimer); remotePullTimer=null; }
    if(ro){ try{ ro.disconnect(); }catch{} }
  }catch{}
  closeMenu(); showAdminModal(false); showManualModal(false);
  board.style.display='none'; board.replaceChildren(); menuList.replaceChildren();
  window.scrollTo(0,0);
  SESSION_TOKEN=""; sessionStorage.removeItem(SESSION_KEY); sessionStorage.removeItem(SESSION_ROLE_KEY);
  sessionStorage.removeItem(SESSION_OFFICE_KEY); sessionStorage.removeItem(SESSION_OFFICE_NAME_KEY);
  CURRENT_OFFICE_NAME=""; CURRENT_OFFICE_ID=""; CURRENT_ROLE="user";
  titleBtn.textContent='在席確認表【開発用】';
  ensureAuthUI();
  try{ await refreshPublicOfficeSelect(); }
  catch{ ensureAuthUIPublicError(); }
  finally{ loginEl.style.display='flex'; }
}

/* 認証UI + 管理UI + マニュアルUI */
function ensureAuthUI(){
  const loggedIn = !!SESSION_TOKEN;
  const showAdmin = loggedIn && (isSuper() || isOfficeAdmin());
  adminBtn.style.display   = showAdmin ? 'inline-block' : 'none';
  logoutBtn.style.display  = loggedIn ? 'inline-block' : 'none';
  manualBtn.style.display  = loggedIn ? 'inline-block' : 'none';
  nameFilter.style.display = loggedIn ? 'inline-block' : 'none';
  statusFilter.style.display = loggedIn ? 'inline-block' : 'none';
}
function showAdminModal(yes){ adminModal.classList.toggle('show', !!yes); }
function applyRoleToAdminPanel(){
  adminOfficeRow.style.display = isSuper() ? '' : 'none';
  document.querySelectorAll('.admin-box[data-super-only="1"]').forEach(el=>{ el.style.display = isSuper() ? '' : 'none'; });
}
async function populateAdminOffices(selected){
        adminOfficeSel.textContent='';
  if(isSuper()){
    const res=await adminListOffices();
    if(!(res&&res.offices)){ toast('拠点一覧の取得に失敗',false); return; }
    res.offices.forEach(o=>{
      if(!ID_RE.test(o.id)) return;
      const opt=document.createElement('option');
      opt.value=o.id;
        const name=stripCtl(o.name);
      opt.textContent=`${name}（${o.id}）`;
      adminOfficeSel.appendChild(opt);
    });
    if(selected && ID_RE.test(selected)) adminOfficeSel.value=selected;
  } else {
    if(ID_RE.test(CURRENT_OFFICE_ID)){
      const opt=document.createElement('option');
      opt.value=CURRENT_OFFICE_ID;
        const name=stripCtl(CURRENT_OFFICE_NAME);
      opt.textContent=`${name}（${CURRENT_OFFICE_ID}）`;
      adminOfficeSel.appendChild(opt);
    }
  }
}
function showManualModal(yes){ manualModal.classList.toggle('show', !!yes); }
function applyRoleToManual(){
  const isAdmin = (isSuper() || isOfficeAdmin());
  manualUser.style.display = '';
  manualAdmin.style.display = isAdmin ? '' : 'none';
}

/* 管理/マニュアルUIイベント */
adminBtn.addEventListener('click', async ()=>{
  applyRoleToAdminPanel();
  await populateAdminOffices();
  showAdminModal(true);
});
adminClose.addEventListener('click', ()=> showAdminModal(false));
refreshOfficesBtn.addEventListener('click', ()=> populateAdminOffices());
logoutBtn.addEventListener('click', logout);

manualBtn.addEventListener('click', ()=>{ applyRoleToManual(); showManualModal(true); });
manualClose.addEventListener('click', ()=> showManualModal(false));
document.addEventListener('keydown', (e)=>{ if(e.key==='Escape'){ showAdminModal(false); showManualModal(false); closeMenu(); }});

/* Admin API */
function selectedOfficeId(){ return isSuper()?adminOfficeSel.value:CURRENT_OFFICE_ID; }
async function adminListOffices(){ return await apiPost({ action:'listOffices', token:SESSION_TOKEN }); }
async function adminGetFor(office){ return await apiPost({ action:'getFor', token:SESSION_TOKEN, office, nocache:'1' }); }
async function adminGetConfigFor(office){ return await apiPost({ action:'getConfigFor', token:SESSION_TOKEN, office, nocache:'1' }); }
async function adminSetConfigFor(office,cfgObj,proof){ const q={ action:'setConfigFor', token:SESSION_TOKEN, office, data:JSON.stringify(cfgObj) }; if(proof){ q.superHmac=proof.hmac; q.nonce=proof.nonce; } return await apiPost(q); }
async function adminSetForChunked(office,dataObjFull,proof){
  const entries=Object.entries(dataObjFull||{});
  if(entries.length===0){
    const base={ action:'setFor', office, token:SESSION_TOKEN, data:JSON.stringify({updated:Date.now(),data:{},full:true}) };
    if(proof){ base.superHmac=proof.hmac; base.nonce=proof.nonce; }
    return await apiPost(base);
  }
  const chunkSize=100; let first=true, ok=true;
  for(let i=0;i<entries.length;i+=chunkSize){
    const chunk=Object.fromEntries(entries.slice(i,i+chunkSize));
    const obj={updated:Date.now(),data:chunk,full:first};
    const q={ action:'setFor', office, token:SESSION_TOKEN, data:JSON.stringify(obj) };
    if(proof){ q.superHmac=proof.hmac; q.nonce=proof.nonce; }
    const r=await apiPost(q);
    if(!(r&&r.ok)) ok=false; first=false;
  }
  return ok?{ok:true}:{error:'chunk_failed'};
}
async function adminRenameOffice(office,name){ return await apiPost({ action:'renameOffice', office, name, token:SESSION_TOKEN }); }
async function adminAddOffice(id,name,pw,apw){ return await apiPost({ action:'addOffice', id, name, password:pw, adminPassword:apw, token:SESSION_TOKEN }); }
async function adminDeleteOffice(office,proof){ const q={ action:'deleteOffice', id:office, token:SESSION_TOKEN }; if(proof){ q.superHmac=proof.hmac; q.nonce=proof.nonce; } return await apiPost(q); }
async function adminSetOfficePassword(office,pw,apw,proof){ const q={ action:'setOfficePassword', id:office, token:SESSION_TOKEN }; if(pw) q.password=pw; if(apw) q.adminPassword=apw; if(proof){ q.superHmac=proof.hmac; q.nonce=proof.nonce; } return await apiPost(q); }

/* CSV（共通） */
function csvProtectFormula(s){ if(s==null) return ''; const v=String(s); return (/^[=\+\-@\t]/.test(v))?"'"+v:v; }
function toCsvRow(arr){ return arr.map(v=>{ const s=csvProtectFormula(v); return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s; }).join(','); }
function makeNormalizedCSV(cfg,data){
  const rows=[];
  rows.push(toCsvRow(['グループ番号','グループ名','表示順','id','氏名','内線','ステータス','戻り時間','備考']));
  (cfg.groups||[]).forEach((g,gi)=>{
    (g.members||[]).forEach((m,mi)=>{
      const id=m.id||''; const rec=(data&&data[id])||{};
      rows.push(toCsvRow([gi+1,g.title||'',mi+1,id,m.name||'',m.ext||'',rec.status||(STATUSES[0]?.value||'在席'),rec.time||'',rec.note||'']));
    });
  });
  return rows.join('\n');
}

/* 認証UI（公開オフィス一覧） */
function setSelectMessage(sel,msg){
  sel.textContent='';
  const opt=document.createElement('option');
  opt.value=''; opt.disabled=true; opt.selected=true; opt.textContent=msg;
  sel.appendChild(opt);
}
function ensureAuthUIPublicError(){ setSelectMessage(officeSel,'取得できませんでした。再読込してください'); }async function refreshPublicOfficeSelect(selectedId){
  setSelectMessage(officeSel,'読込中…');
  const res=await apiPost({ action:'publicListOffices' });
  const offices=(res&&Array.isArray(res.offices))?res.offices:[];
  officeSel.textContent='';
  let found=false;
  offices.forEach(o=>{
    if(!ID_RE.test(o.id)) return;
    const opt=document.createElement('option');
    opt.value=o.id;
      const name=stripCtl(o.name);
      opt.textContent=name;
    officeSel.appendChild(opt);
    if(selectedId && o.id===selectedId) found=true;
  });
  if(officeSel.options.length===0){ ensureAuthUIPublicError(); return; }
  if(selectedId && found) officeSel.value=selectedId; else officeSel.selectedIndex=0;
}

/* 起動 */
document.addEventListener('DOMContentLoaded', async ()=>{
  await refreshPublicOfficeSelect();

  document.getElementById('btnLogin').addEventListener('click', async ()=>{
    const pw=pwInput.value, office=officeSel.value;
    if(!office){ loginMsg.textContent="拠点を選択してください"; return; }
    if(!pw||!pw.trim()){ loginMsg.textContent="パスワードを入力してください"; return; }
    loginMsg.textContent="認証中…";

    // まずスーパー管理者（HMAC）試行
    try{
      const {nonce,salt}=await getNonce();
      const kBytes=await sha256Bytes(salt+pw);
      const hmac=toBase64(await hmacSha256(kBytes,hexToBytes(nonce)));
      const resSup=await apiPost({ action:'login', office, hmac, nonce });
      if(resSup && resSup.token && resSup.role==='superAdmin'){ await afterLogin(resSup); return; }
    }catch{}

    // 通常ログイン
    const res=await apiPost({ action:'login', office, password: pw });
    if(res===null){ loginMsg.textContent="通信エラー"; return; }
    if(res?.error==='unauthorized'){ loginMsg.textContent="拠点またはパスワードが違います"; return; }
    if(res?.ok===false){ loginMsg.textContent="通信エラー"; return; }
    if(!res?.token){ loginMsg.textContent="サーバ応答が不正です"; return; }
        await afterLogin(res);
  });

  async function afterLogin(res){
    SESSION_TOKEN=res.token; sessionStorage.setItem(SESSION_KEY,SESSION_TOKEN);
    CURRENT_OFFICE_NAME=res.officeName||""; CURRENT_OFFICE_ID=res.office||"";
    CURRENT_ROLE = res.role || res.userRole || (res.isAdmin===true?'officeAdmin':'user');
    saveSessionMeta(); titleBtn.textContent=(CURRENT_OFFICE_NAME?`${CURRENT_OFFICE_NAME}　在席確認表【開発用】`:'在席確認表【開発用】');
    loginEl.style.display='none'; loginMsg.textContent=""; ensureAuthUI(); applyRoleToManual();

    // 役割確定（renewで上書き）
    try{
      const me=await apiPost({ action:'renew', token:SESSION_TOKEN });
      if(me&&me.ok){
        CURRENT_ROLE=me.role||CURRENT_ROLE; CURRENT_OFFICE_ID=me.office||CURRENT_OFFICE_ID; CURRENT_OFFICE_NAME=me.officeName||CURRENT_OFFICE_NAME;
        saveSessionMeta(); ensureAuthUI(); applyRoleToManual();
      }
    }catch{}

    const cfgP=(async()=>{
      const cfg=await apiPost({ action:'getConfig', token:SESSION_TOKEN, nocache:'1' });
      if(cfg&&!cfg.error){ GROUPS=normalizeConfigClient(cfg); CONFIG_UPDATED=(typeof cfg.updated==='number')?cfg.updated:0; setupMenus(cfg.menus||null); }
      else { setupMenus(null); }
    })();
    const dataP=fastFetchDataOnce().catch(()=>null);

    await cfgP;
    render(); loadLocal();
    const data=await dataP; if(data&&data.data) applyState(data.data);

    scheduleRenew(Number(res.exp)||TOKEN_DEFAULT_TTL);
    startRemoteSync(true); startConfigWatch();
  }

  // 既存セッション
  const existing=sessionStorage.getItem(SESSION_KEY);
  if(existing){
    SESSION_TOKEN=existing; loginEl.style.display='none';
    loadSessionMeta(); titleBtn.textContent=(CURRENT_OFFICE_NAME?`${CURRENT_OFFICE_NAME}　在席確認表【開発用】`:'在席確認表【開発用】');
    ensureAuthUI(); applyRoleToManual();
    (async()=>{
      const cfg=await apiPost({ action:'getConfig', token:SESSION_TOKEN, nocache:'1' });
      if(cfg&&!cfg.error){ GROUPS=normalizeConfigClient(cfg); CONFIG_UPDATED=(typeof cfg.updated==='number')?cfg.updated:0; setupMenus(cfg.menus||null); render(); }
      const d=await fastFetchDataOnce(); if(d&&d.data) applyState(d.data);
      startRemoteSync(true); startConfigWatch();
    })();
  }else{
    loginEl.style.display='flex';
  }
});
