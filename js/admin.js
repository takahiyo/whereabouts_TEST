/* 管理UIイベント */
if(adminOfficeSel){
  adminOfficeSel.addEventListener('change', ()=>{
    adminSelectedOfficeId=adminOfficeSel.value||'';
    refreshVacationOfficeOptions();
    if(document.getElementById('tabVacations')?.classList.contains('active')){
      loadVacationsList();
    }
  });
}
btnExport.addEventListener('click', async ()=>{
  const office=selectedOfficeId(); if(!office) return;
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
  const office=selectedOfficeId(); if(!office) return;
  const file=csvFile.files&&csvFile.files[0];
  if(!file){ toast('CSVを選択してください',false); return; }

  const text=await file.text();
  const rows=parseCSV(text);
  if(!rows.length){ toast('CSVが空です',false); return; }
  const hdr=rows[0].map(s=>s.trim());
  const mustEn=['group_index','group_title','member_order','id','name','ext','workHours','status','time','note'];
  const mustJa=['グループ番号','グループ名','表示順','id','氏名','内線','業務時間','ステータス','戻り時間','備考'];
  const legacyEn=['group_index','group_title','member_order','id','name','ext','status','time','note'];
  const legacyJa=['グループ番号','グループ名','表示順','id','氏名','内線','ステータス','戻り時間','備考'];
  const okEn = mustEn.every((h,i)=>hdr[i]===h);
  const okJa = mustJa.every((h,i)=>hdr[i]===h);
  const okLegacyEn = legacyEn.every((h,i)=>hdr[i]===h);
  const okLegacyJa = legacyJa.every((h,i)=>hdr[i]===h);
  if(!(okEn || okJa || okLegacyEn || okLegacyJa)){ toast('CSVヘッダが不正です',false); return; }
  const hasWorkHoursColumn = okEn || okJa;
  const keyOf=(gi,gt,mi,name,ext)=>[String(gi),String(gt||''),String(mi),String(name||''),String(ext||'')].join('|');

  const fallbackById=new Map();
  const fallbackByKey=new Map();
  if(!hasWorkHoursColumn){
    try{
      const currentCfg=await adminGetConfigFor(office);
      if(currentCfg && currentCfg.groups){
        (currentCfg.groups||[]).forEach((g,gi0)=>{
          (g.members||[]).forEach((m,mi0)=>{
            const val = m.workHours == null ? '' : String(m.workHours);
            if(!val) return;
            if(m.id) fallbackById.set(String(m.id), val);
            fallbackByKey.set(keyOf(gi0+1,g.title||'',mi0+1,m.name||'',m.ext||''), val);
          });
        });
      }
    }catch{}
  }

  const recs=rows.slice(1).filter(r=>r.some(x=>(x||'').trim()!=='')).map(r=>{
    if(hasWorkHoursColumn){
      const [gi,gt,mi,id,name,ext,workHours,status,time,note]=r;
      const workHoursValue = workHours == null ? '' : String(workHours);
      return {
        gi:Number(gi)||0,
        gt:(gt||''),
        mi:Number(mi)||0,
        id:(id||''),
        name:(name||''),
        ext:(ext||''),
        workHours:workHoursValue,
        status:(status||(STATUSES[0]?.value||'在席')),
        time:(time||''),
        note:(note||'')
      };
    } else {
      const [gi,gt,mi,id,name,ext,status,time,note]=r;
      const key=keyOf(gi,gt,mi,name,ext||'');
      const fallback=(id&&fallbackById.get(id))||fallbackByKey.get(key)||'';
      const workHoursValue = fallback == null ? '' : String(fallback);
      return {
        gi:Number(gi)||0,
        gt:(gt||''),
        mi:Number(mi)||0,
        id:(id||''),
        name:(name||''),
        ext:(ext||''),
        workHours:workHoursValue,
        status:(status||(STATUSES[0]?.value||'在席')),
        time:(time||''),
        note:(note||'')
      };
    }
  });

  const groupsMap=new Map();
  for(const r of recs){
    if(!r.gi||!r.mi||!r.name) continue;
    if(!groupsMap.has(r.gi)) groupsMap.set(r.gi,{title:r.gt||'',members:[]});
    const g=groupsMap.get(r.gi);
    g.title=r.gt||'';
    g.members.push({_mi:r.mi,name:r.name,ext:r.ext||'',workHours:r.workHours||'',id:r.id||undefined});
  }
  const groups=Array.from(groupsMap.entries()).sort((a,b)=>a[0]-b[0]).map(([gi,g])=>{ g.members.sort((a,b)=>(a._mi||0)-(b._mi||0)); g.members.forEach(m=>delete m._mi); return g; });
  const cfgToSet={version:2,updated:Date.now(),groups,menus:MENUS||undefined};
  const r1=await adminSetConfigFor(office,cfgToSet);
  if(!r1 || r1.error){ toast('名簿の設定に失敗',false); return; }

  const newCfg=await adminGetConfigFor(office);
  if(!(newCfg&&newCfg.groups)){ toast('名簿再取得に失敗',false); return; }

  const idIndex=new Map();
  (newCfg.groups||[]).forEach((g,gi0)=>{ (g.members||[]).forEach((m,mi0)=>{ idIndex.set(keyOf(gi0+1,g.title||'',mi0+1,m.name||'',m.ext||''),m.id); }); });

  const dataObj={};
  for(const r of recs){
    const id=r.id || idIndex.get(keyOf(r.gi,r.gt,r.mi,r.name,r.ext||'')) || null;
    if(!id) continue;
    const workHours=r.workHours||'';
    dataObj[id]={ ext:r.ext||'', workHours, status: STATUSES.some(s=>s.value===r.status)? r.status : (STATUSES[0]?.value||'在席'), time:r.time||'', note:r.note||'' };
  }
  const r2=await adminSetForChunked(office,dataObj);
  if(!(r2&&r2.ok)){ toast('在席データ更新に失敗',false); return; }
  toast('インポート完了',true);
});
btnRenameOffice.addEventListener('click', async ()=>{
  const office=selectedOfficeId(); if(!office) return;
  const name=(renameOfficeName.value||'').trim();
  if(!name){ toast('新しい拠点名を入力',false); return; }
  const r=await adminRenameOffice(office,name);
  if(r&&r.ok){ toast('拠点名を変更しました'); }
  else toast('変更に失敗',false);
});

btnSetPw.addEventListener('click', async ()=>{
  const office=selectedOfficeId(); if(!office) return;
  const pw=(setPw.value||'').trim();
  const apw=(setAdminPw.value||'').trim();
  if(!pw&&!apw){ toast('更新する項目を入力',false); return; }
  const r=await adminSetOfficePassword(office,pw,apw);
  if(r&&r.ok){ toast('パスワードを更新しました'); setPw.value=''; setAdminPw.value=''; }
  else toast('更新に失敗',false);
});

/* 管理モーダルのタブ切り替え */
document.querySelectorAll('.admin-tabs .tab-btn').forEach(btn => {
  btn.addEventListener('click', async ()=> {
    const targetTab = btn.dataset.tab;

    document.querySelectorAll('.admin-tabs .tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    document.querySelectorAll('.admin-modal .tab-panel').forEach(panel => panel.classList.remove('active'));
    const panelMap={
      basic: document.getElementById('tabBasic'),
      notices: document.getElementById('tabNotices'),
      vacations: document.getElementById('tabVacations')
    };
    const panel=panelMap[targetTab];
    if(panel) panel.classList.add('active');

    if(targetTab === 'notices'){
      if(typeof autoLoadNoticesOnAdminOpen === 'function'){
        await autoLoadNoticesOnAdminOpen();
      }
    } else if(targetTab === 'vacations'){
      refreshVacationOfficeOptions();
      await loadVacationsList();
    }
  });
});

/* お知らせ管理UI */
btnAddNotice.addEventListener('click', ()=> addNoticeEditorItem());
btnLoadNotices.addEventListener('click', async ()=>{
  const office=selectedOfficeId(); if(!office) return;
  try{
    const params = { action:'getNotices', token:SESSION_TOKEN, nocache:'1', office };
    const res=await apiPost(params);
    console.log('getNotices response:', res);
    if(res && res.notices){
      noticesEditor.innerHTML='';
      if(res.notices.length === 0){
        addNoticeEditorItem();
      } else {
        res.notices.forEach(n=> {
          const visible = (n && n.visible !== false) ? true : (n && n.display !== false);
          addNoticeEditorItem(n.title, n.content, visible !== false);
        });
      }
      toast('お知らせを読み込みました');
    } else if(res && res.error){
      toast('エラー: ' + res.error, false);
    }
  }catch(e){
    console.error('Load notices error:', e);
    toast('お知らせの読み込みに失敗',false);
  }
});
btnSaveNotices.addEventListener('click', async ()=>{
  const office=selectedOfficeId(); if(!office) return;
  const items=noticesEditor.querySelectorAll('.notice-edit-item');
  const notices=[];
  items.forEach(item=>{
    const title=(item.querySelector('.notice-edit-title').value||'').trim();
    const content=(item.querySelector('.notice-edit-content').value||'').trim();
    const displayToggle = item.querySelector('.notice-display-toggle');
    const visible = displayToggle ? displayToggle.checked : true;
    if(title || content){
      notices.push({ title, content, visible, display: visible });
    }
  });
  
  console.log('Saving notices:', notices, 'for office:', office);
  const success=await saveNotices(notices, office);
  if(success) toast('お知らせを保存しました');
  else toast('お知らせの保存に失敗',false);
});

function addNoticeEditorItem(title='', content='', visible=true){
  const item=document.createElement('div');
  item.className='notice-edit-item' + (visible ? '' : ' hidden-notice');
  item.draggable=true;
  item.innerHTML=`
    <span class="notice-edit-handle">⋮⋮</span>
    <div class="notice-edit-row">
      <input type="text" class="notice-edit-title" placeholder="タイトル" value="${escapeHtml(title)}">
      <div class="notice-edit-controls">
        <label class="notice-visibility-toggle"><input type="checkbox" class="notice-display-toggle" ${visible ? 'checked' : ''}> 表示する</label>
        <button class="btn-move-up" title="上に移動">▲</button>
        <button class="btn-move-down" title="下に移動">▼</button>
        <button class="btn-remove-notice">削除</button>
      </div>
    </div>
    <textarea class="notice-edit-content" placeholder="内容（省略可）&#10;URLを記載すると自動的にリンクになります">${escapeHtml(content)}</textarea>
  `;
  
  // 削除ボタン
  item.querySelector('.btn-remove-notice').addEventListener('click', ()=> {
    if(confirm('このお知らせを削除しますか？')){
      item.remove();
      updateMoveButtons();
    }
  });

  const displayToggle = item.querySelector('.notice-display-toggle');
  if(displayToggle){
    displayToggle.addEventListener('change', ()=>{
      if(displayToggle.checked){
        item.classList.remove('hidden-notice');
      }else{
        item.classList.add('hidden-notice');
      }
    });
  }
  
  // 上に移動ボタン
  item.querySelector('.btn-move-up').addEventListener('click', ()=> {
    const prev = item.previousElementSibling;
    if(prev){
      noticesEditor.insertBefore(item, prev);
      updateMoveButtons();
    }
  });
  
  // 下に移動ボタン
  item.querySelector('.btn-move-down').addEventListener('click', ()=> {
    const next = item.nextElementSibling;
    if(next){
      noticesEditor.insertBefore(next, item);
      updateMoveButtons();
    }
  });
  
  // ドラッグ&ドロップイベント
  item.addEventListener('dragstart', (e)=> {
    item.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
  });
  
  item.addEventListener('dragend', ()=> {
    item.classList.remove('dragging');
    document.querySelectorAll('.notice-edit-item').forEach(i=> i.classList.remove('drag-over'));
  });
  
  item.addEventListener('dragover', (e)=> {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const dragging = noticesEditor.querySelector('.dragging');
    if(dragging && dragging !== item){
      const rect = item.getBoundingClientRect();
      const midpoint = rect.top + rect.height / 2;
      if(e.clientY < midpoint){
        noticesEditor.insertBefore(dragging, item);
      } else {
        noticesEditor.insertBefore(dragging, item.nextSibling);
      }
    }
  });
  
  noticesEditor.appendChild(item);
  updateMoveButtons();
}

// 上下移動ボタンの有効/無効を更新
function updateMoveButtons(){
  const items = noticesEditor.querySelectorAll('.notice-edit-item');
  items.forEach((item, index)=> {
    const upBtn = item.querySelector('.btn-move-up');
    const downBtn = item.querySelector('.btn-move-down');
    if(upBtn) upBtn.disabled = (index === 0);
    if(downBtn) downBtn.disabled = (index === items.length - 1);
  });
}

/* 長期休暇管理UI */
if(btnVacationSave){ btnVacationSave.addEventListener('click', handleVacationSave); }
if(btnVacationDelete){ btnVacationDelete.addEventListener('click', handleVacationDelete); }
if(btnVacationReload){ btnVacationReload.addEventListener('click', ()=> loadVacationsList(true)); }
if(btnVacationClear){ btnVacationClear.addEventListener('click', resetVacationForm); }

function refreshVacationOfficeOptions(){
  if(!vacationOfficeSelect) return;
  const prev=vacationOfficeSelect.value||'';
  vacationOfficeSelect.textContent='';

  const adminOptions=(adminOfficeSel&&adminOfficeSel.options&&adminOfficeSel.options.length)?Array.from(adminOfficeSel.options):[];
  const usableOptions=adminOptions.filter(o=>o.value);
  if(usableOptions.length){
    usableOptions.forEach(opt=>{
      const o=document.createElement('option');
      o.value=opt.value; o.textContent=opt.textContent||opt.value;
      vacationOfficeSelect.appendChild(o);
    });
  }else if(CURRENT_OFFICE_ID){
    const o=document.createElement('option');
    o.value=CURRENT_OFFICE_ID; o.textContent=CURRENT_OFFICE_NAME||CURRENT_OFFICE_ID;
    vacationOfficeSelect.appendChild(o);
  }else{
    const o=document.createElement('option');
    o.value=''; o.textContent='対象拠点を選択してください'; o.disabled=true; o.selected=true;
    vacationOfficeSelect.appendChild(o);
  }

  if(prev && vacationOfficeSelect.querySelector(`option[value="${prev}"]`)){
    vacationOfficeSelect.value=prev;
  }else if(vacationOfficeSelect.options.length){
    vacationOfficeSelect.selectedIndex=0;
  }
}

function getVacationTargetOffice(){
  const office=(vacationOfficeSelect&&vacationOfficeSelect.value)||selectedOfficeId();
  if(!office){ toast('対象拠点を選択してください',false); }
  return office;
}

function resetVacationForm(){
  if(vacationTitleInput) vacationTitleInput.value='';
  if(vacationStartInput) vacationStartInput.value='';
  if(vacationEndInput) vacationEndInput.value='';
  if(vacationNoteInput) vacationNoteInput.value='';
  if(vacationMembersBitsInput) vacationMembersBitsInput.value='';
  if(vacationIdInput) vacationIdInput.value='';
}

function fillVacationForm(item){
  if(!item) return;
  if(vacationTitleInput) vacationTitleInput.value=item.title||'';
  if(vacationStartInput) vacationStartInput.value=item.startDate||item.start||item.from||'';
  if(vacationEndInput) vacationEndInput.value=item.endDate||item.end||item.to||'';
  if(vacationNoteInput) vacationNoteInput.value=item.note||item.memo||'';
  if(vacationMembersBitsInput) vacationMembersBitsInput.value=item.membersBits||item.bits||'';
  if(vacationIdInput) vacationIdInput.value=item.id||item.vacationId||'';
  if(vacationOfficeSelect && item.office){
    refreshVacationOfficeOptions();
    if(vacationOfficeSelect.querySelector(`option[value="${item.office}"]`)){
      vacationOfficeSelect.value=item.office;
    }
  }
}

function renderVacationRows(list){
  if(!vacationListBody) return;
  vacationListBody.textContent='';
  if(!Array.isArray(list) || list.length===0){
    const tr=document.createElement('tr');
    const td=document.createElement('td');
    td.colSpan=5; td.style.textAlign='center'; td.textContent='長期休暇はありません';
    tr.appendChild(td); vacationListBody.appendChild(tr); return;
  }

  list.forEach(item=>{
    const tr=document.createElement('tr');
    const titleTd=document.createElement('td'); titleTd.textContent=item.title||'';
    const start=item.startDate||item.start||item.from||'';
    const end=item.endDate||item.end||item.to||'';
    const periodTd=document.createElement('td'); periodTd.textContent=start||end?`${start||''}〜${end||''}`:'-';
    const officeTd=document.createElement('td'); officeTd.textContent=item.office||'';
    const noteTd=document.createElement('td'); noteTd.textContent=item.note||item.memo||'';
    const actionTd=document.createElement('td');
    const editBtn=document.createElement('button'); editBtn.textContent='編集'; editBtn.className='btn-secondary';
    editBtn.addEventListener('click', ()=> fillVacationForm(item));
    actionTd.appendChild(editBtn);
    tr.appendChild(titleTd); tr.appendChild(periodTd); tr.appendChild(officeTd); tr.appendChild(noteTd); tr.appendChild(actionTd);
    vacationListBody.appendChild(tr);
  });
}

async function loadVacationsList(showToastOnSuccess=false){
  const office=getVacationTargetOffice(); if(!office) return;
  if(vacationListBody){
    vacationListBody.textContent='';
    const tr=document.createElement('tr'); const td=document.createElement('td'); td.colSpan=5; td.style.textAlign='center'; td.textContent='読み込み中...'; tr.appendChild(td); vacationListBody.appendChild(tr);
  }
  try{
    const res=await adminGetVacation(office);
    const list=Array.isArray(res?.vacations)?res.vacations:(Array.isArray(res?.items)?res.items:[]);
    renderVacationRows(list);
    if(showToastOnSuccess) toast('長期休暇を読み込みました');
  }catch(err){
    console.error('loadVacationsList error',err);
    if(vacationListBody){
      vacationListBody.textContent='';
      const tr=document.createElement('tr'); const td=document.createElement('td'); td.colSpan=5; td.style.textAlign='center'; td.textContent='読み込みに失敗しました'; tr.appendChild(td); vacationListBody.appendChild(tr);
    }
    toast('長期休暇の取得に失敗しました',false);
  }
}

async function handleVacationSave(){
  const office=getVacationTargetOffice(); if(!office) return;
  const title=(vacationTitleInput?.value||'').trim();
  const start=(vacationStartInput?.value||'').trim();
  const end=(vacationEndInput?.value||'').trim();
  const note=(vacationNoteInput?.value||'').trim();
  const membersBits=(vacationMembersBitsInput?.value||'').trim();
  const id=(vacationIdInput?.value||'').trim();
  if(!title){ toast('タイトルを入力してください',false); return; }
  if(start && end && start>end){ toast('開始日と終了日の指定を確認してください',false); return; }

  const payload={ office, title, start, end, note, membersBits };
  if(id) payload.id=id;

  try{
    const res=await adminSetVacation(office,payload);
    if(res && res.ok!==false){
      if(res.id && vacationIdInput){ vacationIdInput.value=res.id; }
      toast('長期休暇を保存しました');
      await loadVacationsList();
    }else{
      throw new Error(res&&res.error?String(res.error):'save_failed');
    }
  }catch(err){
    console.error('handleVacationSave error',err);
    toast('長期休暇の保存に失敗しました',false);
  }
}

async function handleVacationDelete(){
  const office=getVacationTargetOffice(); if(!office) return;
  const id=(vacationIdInput?.value||'').trim();
  if(!id){ toast('削除する項目のIDを選択してください',false); return; }
  if(!confirm('選択中の長期休暇を削除しますか？')) return;
  try{
    const res=await adminDeleteVacation(office,id);
    if(res && res.ok!==false){
      toast('削除しました');
      resetVacationForm();
      await loadVacationsList();
    }else{
      throw new Error(res&&res.error?String(res.error):'delete_failed');
    }
  }catch(err){
    console.error('handleVacationDelete error',err);
    toast('長期休暇の削除に失敗しました',false);
  }
}

/* Admin API */
function selectedOfficeId(){
  const office=adminSelectedOfficeId||CURRENT_OFFICE_ID||'';
  if(!office){ toast('操作対象拠点を選択してください',false); }
  return office;
}
async function adminGetFor(office){ return await apiPost({ action:'getFor', token:SESSION_TOKEN, office, nocache:'1' }); }
async function adminGetConfigFor(office){ return await apiPost({ action:'getConfigFor', token:SESSION_TOKEN, office, nocache:'1' }); }
async function adminSetConfigFor(office,cfgObj){ const q={ action:'setConfigFor', token:SESSION_TOKEN, office, data:JSON.stringify(cfgObj) }; return await apiPost(q); }
async function adminSetForChunked(office,dataObjFull){
  const entries=Object.entries(dataObjFull||{});
  if(entries.length===0){
    const base={ action:'setFor', office, token:SESSION_TOKEN, data:JSON.stringify({updated:Date.now(),data:{},full:true}) };
    return await apiPost(base);
  }
  const chunkSize=100; let first=true, ok=true;
  for(let i=0;i<entries.length;i+=chunkSize){
    const chunk=Object.fromEntries(entries.slice(i,i+chunkSize));
    const obj={updated:Date.now(),data:chunk,full:first};
    const q={ action:'setFor', office, token:SESSION_TOKEN, data:JSON.stringify(obj) };
    const r=await apiPost(q);
    if(!(r&&r.ok)) ok=false; first=false;
  }
  return ok?{ok:true}:{error:'chunk_failed'};
}
async function adminRenameOffice(office,name){ return await apiPost({ action:'renameOffice', office, name, token:SESSION_TOKEN }); }
async function adminSetOfficePassword(office,pw,apw){ const q={ action:'setOfficePassword', id:office, token:SESSION_TOKEN }; if(pw) q.password=pw; if(apw) q.adminPassword=apw; return await apiPost(q); }
async function adminGetVacation(office){ return await apiPost({ action:'getVacation', token:SESSION_TOKEN, office, nocache:'1' }); }
async function adminSetVacation(office,payload){ const q={ action:'setVacation', token:SESSION_TOKEN, office, data:JSON.stringify(payload) }; return await apiPost(q); }
async function adminDeleteVacation(office,id){ return await apiPost({ action:'deleteVacation', token:SESSION_TOKEN, office, id }); }

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

/* CSV（共通） */
function csvProtectFormula(s){ if(s==null) return ''; const v=String(s); return (/^[=\+\-@\t]/.test(v))?"'"+v:v; }
function toCsvRow(arr){ return arr.map(v=>{ const s=csvProtectFormula(v); return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s; }).join(','); }
function makeNormalizedCSV(cfg,data){
  const rows=[];
  rows.push(toCsvRow(['グループ番号','グループ名','表示順','id','氏名','内線','業務時間','ステータス','戻り時間','備考']));
  (cfg.groups||[]).forEach((g,gi)=>{
    (g.members||[]).forEach((m,mi)=>{
      const id=m.id||''; const rec=(data&&data[id])||{};
      const workHours = rec.workHours || m.workHours || '';
      rows.push(toCsvRow([gi+1,g.title||'',mi+1,id,m.name||'',m.ext||'',workHours,rec.status||(STATUSES[0]?.value||'在席'),rec.time||'',rec.note||'']));
    });
  });
  return rows.join('\n');
}

/* 管理モーダルを開いたときにお知らせを自動読み込み */
async function autoLoadNoticesOnAdminOpen(){
  const office = adminSelectedOfficeId || CURRENT_OFFICE_ID;
  if(!office) return;
  try{
    const params = { action:'getNotices', token:SESSION_TOKEN, nocache:'1', office };
    const res = await apiPost(params);
    if(res && res.notices){
      noticesEditor.innerHTML = '';
      if(res.notices.length === 0){
        addNoticeEditorItem();
      } else {
        res.notices.forEach(n=> {
          const visible = (n && n.visible !== false) ? true : (n && n.display !== false);
          addNoticeEditorItem(n.title, n.content, visible !== false);
        });
      }
    }
  }catch(e){
    console.error('Auto-load notices error:', e);
  }
}
