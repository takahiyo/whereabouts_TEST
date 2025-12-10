/* 管理UIイベント */
if(adminOfficeSel){
  adminOfficeSel.addEventListener('change', ()=>{
    adminSelectedOfficeId=adminOfficeSel.value||'';
    refreshVacationOfficeOptions();
    if(document.getElementById('tabEvents')?.classList.contains('active')){
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
if(adminModal){
  const adminTabButtons = adminModal.querySelectorAll('.admin-tabs .tab-btn');
  const adminTabPanels = adminModal.querySelectorAll('.tab-panel');

  adminTabButtons.forEach(btn => {
    btn.addEventListener('click', async ()=> {
      const targetTab = btn.dataset.tab;

      adminTabButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      adminTabPanels.forEach(panel => panel.classList.remove('active'));
      const panelMap={
        basic: adminModal.querySelector('#tabBasic'),
        notices: adminModal.querySelector('#tabNotices'),
        events: adminModal.querySelector('#tabEvents')
      };
      const panel=panelMap[targetTab];
      if(panel) panel.classList.add('active');

      if(targetTab === 'notices'){
        if(typeof autoLoadNoticesOnAdminOpen === 'function'){
          await autoLoadNoticesOnAdminOpen();
        }
      } else if(targetTab === 'events'){
        if(typeof fetchNotices === 'function'){
          await fetchNotices();
        }
        refreshVacationOfficeOptions();
        refreshVacationNoticeOptions();
        await loadVacationsList();
      }
    });
  });
}

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

/* イベント管理UI */
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

function getNoticesForLookup(){
  return Array.isArray(window.CURRENT_NOTICES)?window.CURRENT_NOTICES:[];
}

function getNoticesForSelection(){
  return getNoticesForLookup().filter(n=> n && n.visible !== false && n.display !== false);
}

function refreshVacationNoticeOptions(selectedId){
  if(!vacationNoticeSelect) return;
  const notices=getNoticesForSelection();
  const prev=selectedId!==undefined?String(selectedId||''):(vacationNoticeSelect.value||'');
  vacationNoticeSelect.textContent='';
  const placeholder=document.createElement('option');
  placeholder.value='';
  placeholder.textContent='お知らせを選択';
  vacationNoticeSelect.appendChild(placeholder);

  notices.forEach((notice, idx)=>{
    const id=String(notice.id || notice.noticeId || notice.title || idx);
    const title=(notice.title||'(無題)').trim();
    const opt=document.createElement('option');
    opt.value=id;
    opt.textContent=title;
    opt.dataset.title=title;
    vacationNoticeSelect.appendChild(opt);
  });

  const match=Array.from(vacationNoticeSelect.options||[]).find(o=>o.value===prev);
  vacationNoticeSelect.value=match?prev:'';
}

function findNoticeSelectionForItem(item){
  if(!item) return null;
  const notices=getNoticesForLookup();
  const desiredId=item.noticeId || item.noticeKey || '';
  const desiredTitle=item.noticeTitle || '';
  const legacyNote=item.note || item.memo || '';
  const candidates=[
    notices.find(n=> String(n?.id||n?.noticeId||'')===String(desiredId)),
    notices.find(n=> (n?.title||'') === desiredTitle),
    notices.find(n=> (n?.title||'') === legacyNote)
  ].filter(Boolean);
  const picked=candidates[0];
  if(picked){
    return { id:String(picked.id||picked.noticeId||picked.title||notices.indexOf(picked)), title:picked.title||desiredTitle||legacyNote||'' };
  }
  if(desiredId || desiredTitle){
    return { id:String(desiredId||desiredTitle), title:desiredTitle||legacyNote||'' };
  }
  return null;
}

function getSelectedNoticeInfo(){
  if(!vacationNoticeSelect) return null;
  const val=vacationNoticeSelect.value||'';
  if(!val) return null;
  const notices=getNoticesForLookup();
  const found=notices.find(n=> String(n?.id||n?.noticeId||n?.title||'')===val);
  const title=(found?.title || vacationNoticeSelect.selectedOptions?.[0]?.textContent || '').trim();
  return { id:val, title };
}

function resetVacationForm(){
  if(vacationTitleInput) vacationTitleInput.value='';
  if(vacationStartInput) vacationStartInput.value='';
  if(vacationEndInput) vacationEndInput.value='';
  if(vacationNoticeSelect){ vacationNoticeSelect.value=''; refreshVacationNoticeOptions(); }
  cachedVacationLegacyNote='';
  if(vacationMembersBitsInput) vacationMembersBitsInput.value='';
  if(vacationIdInput) vacationIdInput.value='';
  if(vacationTypeText) vacationTypeText.value='休暇固定（一覧で切替）';
  if(vacationColorSelect) vacationColorSelect.value = 'amber';
  if(window.VacationGantt){
    window.VacationGantt.reset();
  }
}

function fillVacationForm(item){
  if(!item) return;
  if(vacationTitleInput) vacationTitleInput.value=item.title||'';
  if(vacationStartInput) vacationStartInput.value=item.startDate||item.start||item.from||'';
  if(vacationEndInput) vacationEndInput.value=item.endDate||item.end||item.to||'';
  cachedVacationLegacyNote=item.note||item.memo||'';
  const noticeSel=findNoticeSelectionForItem(item);
  refreshVacationNoticeOptions(noticeSel?.id);
  if(vacationNoticeSelect){
    vacationNoticeSelect.value=noticeSel?.id||'';
  }
  if(vacationMembersBitsInput) vacationMembersBitsInput.value=item.membersBits||item.bits||'';
  if(vacationIdInput) vacationIdInput.value=item.id||item.vacationId||'';
  if(vacationTypeText) vacationTypeText.value = getVacationTypeLabel(item.isVacation !== false);
  if(vacationColorSelect) vacationColorSelect.value = item.color || 'amber';
  if(vacationOfficeSelect && item.office){
    refreshVacationOfficeOptions();
    if(vacationOfficeSelect.querySelector(`option[value="${item.office}"]`)){
      vacationOfficeSelect.value=item.office;
    }
  }
  if(window.VacationGantt){
    window.VacationGantt.loadFromString(item.membersBits||item.bits||'');
  }
}

function getVacationTypeLabel(isVacation){ return (isVacation === false)?'予定のみ':'休暇固定'; }

let cachedVacationList=[];
let cachedVacationLegacyNote='';

function normalizeVacationList(list, officeId){
  if(!Array.isArray(list)) return [];
  const prevList=Array.isArray(cachedVacationList)?cachedVacationList:[];
  const targetOffice=officeId==null?'':String(officeId);
  return list.map(item=>{
    const idStr=String(item?.id||item?.vacationId||'');
    const itemOffice=String(item?.office||targetOffice||'');
    const prev=prevList.find(v=> String(v?.id||v?.vacationId||'') === idStr && String(v?.office||targetOffice||'') === itemOffice);
    const hasIsVacation=item && Object.prototype.hasOwnProperty.call(item,'isVacation');
    const fallbackHasFlag=prev && Object.prototype.hasOwnProperty.call(prev,'isVacation');
    const isVacation=hasIsVacation ? item.isVacation : (fallbackHasFlag ? prev.isVacation : undefined);
    return { ...item, office:itemOffice || (item?.office||''), isVacation };
  });
}

function renderVacationRows(list, officeId){
  if(!vacationListBody) return;
  const normalizedList=normalizeVacationList(list, officeId);
  cachedVacationList=normalizedList;
  vacationListBody.textContent='';
  if(!Array.isArray(normalizedList) || normalizedList.length===0){
    const tr=document.createElement('tr');
    const td=document.createElement('td');
    td.colSpan=8; td.style.textAlign='center'; td.textContent='イベントはありません';
    tr.appendChild(td); vacationListBody.appendChild(tr); return;
  }

  normalizedList.forEach(item=>{
    const tr=document.createElement('tr');
    const titleTd=document.createElement('td'); titleTd.textContent=item.title||'';
    const start=item.startDate||item.start||item.from||'';
    const end=item.endDate||item.end||item.to||'';
    const periodTd=document.createElement('td'); periodTd.textContent=start||end?`${start||''}〜${end||''}`:'-';
    const officeTd=document.createElement('td'); officeTd.textContent=item.office||'';
    const typeTd=document.createElement('td');
    const typeToggle=document.createElement('input');
    typeToggle.type='checkbox';
    typeToggle.checked=item.isVacation !== false;
    const typeLabel=document.createElement('span');
    typeLabel.className='vacation-type-label';
    typeLabel.textContent=getVacationTypeLabel(typeToggle.checked);
    typeToggle.addEventListener('change', async ()=>{
      typeToggle.disabled=true;
      const success=await updateVacationFlags(item,{ isVacation:typeToggle.checked });
      if(!success){
        typeToggle.checked=!typeToggle.checked;
      }else{
        typeLabel.textContent=getVacationTypeLabel(typeToggle.checked);
      }
      typeToggle.disabled=false;
    });
    typeTd.append(typeToggle, typeLabel);
    const colorTd=document.createElement('td');
    const colorBadge=document.createElement('span');
    colorBadge.className=`event-color-dot ${getEventColorClass(item.color)}`.trim();
    colorBadge.title=EVENT_COLOR_LABELS[item.color]||'';
    colorTd.appendChild(colorBadge);
    const noteTd=document.createElement('td');
    const noticeSel=findNoticeSelectionForItem(item);
    if(noticeSel && noticeSel.title){
      const link=document.createElement('a');
      link.href='#noticesArea';
      link.textContent=noticeSel.title;
      link.addEventListener('click',(e)=>{
        e.preventDefault();
        if(typeof toggleNoticesArea==='function'){ toggleNoticesArea(); }
        const noticesArea=document.getElementById('noticesArea');
        if(noticesArea){
          noticesArea.style.display='block';
          noticesArea.classList.remove('collapsed');
          noticesArea.scrollIntoView({ behavior:'smooth', block:'start' });
        }
      });
      noteTd.appendChild(link);
    }else if(item.note||item.memo){
      noteTd.textContent=item.note||item.memo||'';
    }else{
      noteTd.textContent='-';
    }
    const visibleTd=document.createElement('td');
    const visibleToggle=document.createElement('input');
    visibleToggle.type='checkbox';
    visibleToggle.checked=item.visible === true;
    visibleToggle.addEventListener('change', async ()=>{
      visibleToggle.disabled=true;
      const success=await updateVacationFlags(item,{ visible: visibleToggle.checked });
      if(!success){
        visibleToggle.checked=!visibleToggle.checked;
      }
      visibleToggle.disabled=false;
    });
    visibleTd.appendChild(visibleToggle);
    const actionTd=document.createElement('td');
    const editBtn=document.createElement('button'); editBtn.textContent='編集'; editBtn.className='btn-secondary';
    editBtn.addEventListener('click', ()=> fillVacationForm(item));
    actionTd.appendChild(editBtn);
    tr.append(titleTd, periodTd, officeTd, typeTd, colorTd, noteTd, visibleTd, actionTd);
    vacationListBody.appendChild(tr);
  });
}

async function updateVacationFlags(item, overrides={}){
  const office=item.office||getVacationTargetOffice(); if(!office) return false;
  const visible=(overrides.visible!==undefined)?overrides.visible:(item.visible === true);
  const isVacation=(overrides.isVacation!==undefined)?overrides.isVacation:(item.isVacation !== false);
  const payload={
    office,
    title:item.title||'',
    start:item.startDate||item.start||item.from||'',
    end:item.endDate||item.end||item.to||'',
    note:item.note||item.memo||item.noticeTitle||'',
    noticeId:item.noticeId||item.noticeKey||'',
    noticeTitle:item.noticeTitle||'',
    membersBits:item.membersBits||item.bits||'',
    visible,
    isVacation,
    color: item.color || 'amber'
  };
  const id=item.id||item.vacationId||'';
  if(id) payload.id=id;
  try{
    const res=await adminSetVacation(office,payload);
    if(res && res.ok!==false){
      if(res.vacation){
        item.visible = res.vacation.visible === true;
        item.isVacation = res.vacation.isVacation !== false;
        item.color = res.vacation.color || item.color;
      }else{
        item.visible = visible;
        item.isVacation = isVacation;
      }
      toast('イベント設定を更新しました');
      if(Array.isArray(res.vacations)){
        renderVacationRows(res.vacations, office);
      }else{
        await loadVacationsList(false, office);
      }
      if(office){ await loadEvents(office, false); }
      return true;
    }
    throw new Error(res&&res.error?String(res.error):'update_failed');
  }catch(err){
    console.error('updateVacationFlags error',err);
    toast('イベント設定の更新に失敗しました',false);
    return false;
  }
}

async function loadVacationsList(showToastOnSuccess=false, officeOverride){
  const office=officeOverride||getVacationTargetOffice(); if(!office) return;
  if(vacationListBody){
    vacationListBody.textContent='';
    const tr=document.createElement('tr'); const td=document.createElement('td'); td.colSpan=8; td.style.textAlign='center'; td.textContent='読み込み中...'; tr.appendChild(td); vacationListBody.appendChild(tr);
  }
  try{
    const res=await adminGetVacation(office);
    const list=Array.isArray(res?.vacations)?res.vacations:(Array.isArray(res?.items)?res.items:[]);
    renderVacationRows(list, office);
    if(showToastOnSuccess) toast('イベントを読み込みました');
  }catch(err){
    console.error('loadVacationsList error',err);
    if(vacationListBody){
      vacationListBody.textContent='';
      const tr=document.createElement('tr'); const td=document.createElement('td'); td.colSpan=8; td.style.textAlign='center'; td.textContent='読み込みに失敗しました'; tr.appendChild(td); vacationListBody.appendChild(tr);
    }
    toast('イベントの取得に失敗しました',false);
  }finally{
    resetVacationForm();
  }
}

async function handleVacationSave(){
  const office=getVacationTargetOffice(); if(!office) return;
  const title=(vacationTitleInput?.value||'').trim();
  const start=(vacationStartInput?.value||'').trim();
  const end=(vacationEndInput?.value||'').trim();
  if(window.VacationGantt){
    window.VacationGantt.syncInput();
  }
  const membersBits=(vacationMembersBitsInput?.value||'').trim();
  const id=(vacationIdInput?.value||'').trim();
  const color=(vacationColorSelect?.value||'amber');
  if(!title){ toast('タイトルを入力してください',false); return; }
  if(start && end && start>end){ toast('開始日と終了日の指定を確認してください',false); return; }

  const payload={ office, title, start, end, membersBits, color };

  const noticeSel=getSelectedNoticeInfo();
  if(noticeSel){
    payload.noticeId=noticeSel.id;
    payload.noticeTitle=noticeSel.title;
    if(noticeSel.title) payload.note=noticeSel.title;
  }else if(cachedVacationLegacyNote){
    payload.note=cachedVacationLegacyNote;
  }
  if(id) payload.id=id;

  try{
    const res=await adminSetVacation(office,payload);
    if(res && res.ok!==false){
      if(res.id && vacationIdInput){ vacationIdInput.value=res.id; }
      if(res.vacation){
        if(vacationTypeText) vacationTypeText.value = getVacationTypeLabel(res.vacation.isVacation !== false);
        if(vacationColorSelect && res.vacation.color){ vacationColorSelect.value = res.vacation.color; }
      }
      toast('イベントを保存しました');
      if(Array.isArray(res.vacations)){
        renderVacationRows(res.vacations, office);
      }else{
        await loadVacationsList(false, office);
      }
      await loadEvents(office, false);
      resetVacationForm();
    }else{
      throw new Error(res&&res.error?String(res.error):'save_failed');
    }
  }catch(err){
    console.error('handleVacationSave error',err);
    toast('イベントの保存に失敗しました',false);
  }
}

async function handleVacationDelete(){
  const office=getVacationTargetOffice(); if(!office) return;
  const id=(vacationIdInput?.value||'').trim();
  if(!id){ toast('削除する項目のIDを選択してください',false); return; }
  if(!confirm('選択中のイベントを削除しますか？')) return;
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
    toast('イベントの削除に失敗しました',false);
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
