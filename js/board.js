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

  const workPlaceholder = (MENUS?.businessHours && MENUS.businessHours[0]) ? MENUS.businessHours[0] : '09:00-18:00';
  const workInit = member.workHours == null ? '' : String(member.workHours);
  const tdWork=el('td',{class:'work','data-label':'業務時間'});
  const inpWork=el('input',{id:`work-${key}`,name:'workHours',type:'text',list:'workHourOptions',placeholder:workPlaceholder,autocomplete:'off',inputmode:'text'});
  inpWork.value = workInit;
  tdWork.appendChild(el('label',{class:'sr-only',for:`work-${key}`,text:'業務時間'}));
  tdWork.appendChild(inpWork);

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

  tr.append(tdName,tdExt,tdWork,tdStatus,tdTime,tdNote);
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
  let w=tr.querySelector('input[name="workHours"]');
  if(!w){
    const td=tr.querySelector('td.work');
    const placeholder = (MENUS?.businessHours && MENUS.businessHours[0]) ? MENUS.businessHours[0] : '09:00-18:00';
    w=el('input',{id:`work-${key}`,name:'workHours',type:'text',list:'workHourOptions',placeholder,autocomplete:'off',inputmode:'text'});
    if(td){
      if(!td.querySelector('label.sr-only')){
        td.insertBefore(el('label',{class:'sr-only',for:`work-${key}`,text:'業務時間'}), td.firstChild || null);
      }
      td.appendChild(w);
    }
    diagAdd('fix: workHours input injected');
  }
  if(w && w.getAttribute('list')!=='workHourOptions'){
    w.setAttribute('list','workHourOptions');
    diagAdd('fix: workHours datalist reattached');
  }
  if(w){
    const placeholder = (MENUS?.businessHours && MENUS.businessHours[0]) ? MENUS.businessHours[0] : '09:00-18:00';
    if(w.getAttribute('placeholder')!==placeholder) w.setAttribute('placeholder',placeholder);
    w.setAttribute('autocomplete','off');
    w.setAttribute('inputmode','text');
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
    el('col',{class:'col-work'}),
    el('col',{class:'col-status'}),
    el('col',{class:'col-time'}),
    el('col',{class:'col-note'})
  ]));
  const thead=el('thead'); const thr=el('tr'); ['氏名','内線','業務時間','ステータス','戻り時間','備考'].forEach(h=>thr.appendChild(el('th',{text:h}))); thead.appendChild(thr); table.appendChild(thead);
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
  if(!tr) return {ext:"",workHours:"",status:STATUSES[0]?.value||"在席",time:"",note:""};
    const workHoursInput = tr.querySelector('input[name="workHours"]');
  return {
    ext: tr.querySelector('td.ext')?.textContent.trim() || "",
    workHours: workHoursInput ? workHoursInput.value : "",
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
    const s=tr?.querySelector('select[name="status"]'), t=tr?.querySelector('select[name="time"]'), w=tr?.querySelector('input[name="workHours"]'), n=tr?.querySelector('input[name="note"]');
    if(!tr || !s || !t || !w){ ensureRowControls(tr); }
    if(v.status && STATUSES.some(x=>x.value===v.status)) setIfNeeded(s,v.status);
    setIfNeeded(w, (v && typeof v.workHours === 'string') ? v.workHours : (v && v.workHours==null ? '' : String(v?.workHours ?? '')));
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
const rowTimers=new Map();
function debounceRowPush(key,delay=900){ PENDING_ROWS.add(key); if(rowTimers.has(key)) clearTimeout(rowTimers.get(key)); rowTimers.set(key,setTimeout(()=>{ rowTimers.delete(key); pushRowDelta(key); },delay)); }

/* 入力イベント（IME配慮・デバウンス） */
function wireEvents(){
  // IME対策
  board.addEventListener('compositionstart', e => { const t=e.target; if(t && t.dataset) t.dataset.composing='1'; });
  board.addEventListener('compositionend',   e => { const t=e.target; if(t && t.dataset) delete t.dataset.composing; });

  board.addEventListener('focusin',  e => { const t=e.target; if(t && t.dataset) t.dataset.editing='1'; });
  board.addEventListener('focusout', e =>{
    const t=e.target;
    if(!(t && t.dataset)) return;
    const tr=t.closest('tr');
    const key=tr?.dataset.key;
    if((t.name==='note' || t.name==='workHours') && key && PENDING_ROWS.has(key)){ t.dataset.editing='1'; }
    else{ delete t.dataset.editing; }
  });
  // 入力（備考：入力中は自動更新停止 → setIfNeeded が弾く）
  board.addEventListener('input', (e)=>{
    const t = e.target;
    if(!(t && t.name)) return;
    const tr = t.closest('tr'); if(!tr) return;
    const key = tr.dataset.key;
    if(t.name === 'note'){ debounceRowPush(key); return; }
    if(t.name === 'workHours'){ debounceRowPush(key); return; }
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
