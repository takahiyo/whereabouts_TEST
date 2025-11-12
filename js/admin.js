/* 管理UIイベント */
if(adminOfficeSel){ adminOfficeSel.addEventListener('change', ()=>{ adminSelectedOfficeId=adminOfficeSel.value||''; }); }
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
btnLoadMenus.addEventListener('click', async ()=>{
  const office=selectedOfficeId(); if(!office) return;
  const cfg=await adminGetConfigFor(office);
  menusJson.value=JSON.stringify((cfg&&cfg.menus)||defaultMenus(),null,2);
});
btnSaveMenus.addEventListener('click', async ()=>{
  let obj;
  try{ obj=JSON.parse(menusJson.value); }catch{ toast('JSONの形式が不正です',false); return; }
  // --- normalize legacy keys for business-hours list ---
  if(obj && typeof obj === 'object'){
    if(!Array.isArray(obj.businessHours)){
      if(Array.isArray(obj.workHourOptions)) obj.businessHours = obj.workHourOptions;
      else if(Array.isArray(obj.workHoursOptions)) obj.businessHours = obj.workHoursOptions;
    }
  }

  const office=selectedOfficeId(); if(!office) return;
  const cfg=await adminGetConfigFor(office);
  if(!(cfg&&cfg.groups)){ toast('名簿の取得に失敗',false); return; }

  cfg.menus=obj;
  const r=await adminSetConfigFor(office,cfg);
  if(r && !r.error){ toast('メニュー設定を保存しました'); setupMenus(cfg.menus); render(); }
  else toast('保存に失敗',false);
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
        res.notices.forEach(n=> addNoticeEditorItem(n.title, n.content));
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
    if(title || content){
      notices.push({ title, content });
    }
  });
  
  console.log('Saving notices:', notices, 'for office:', office);
  const success=await saveNotices(notices, office);
  if(success) toast('お知らせを保存しました');
  else toast('お知らせの保存に失敗',false);
});

function addNoticeEditorItem(title='', content=''){
  const item=document.createElement('div');
  item.className='notice-edit-item';
  item.innerHTML=`
    <div class="notice-edit-row">
      <input type="text" class="notice-edit-title" placeholder="タイトル" value="${escapeHtml(title)}">
      <button class="btn-remove-notice">削除</button>
    </div>
    <textarea class="notice-edit-content" placeholder="内容（省略可）&#10;URLを記載すると自動的にリンクになります">${escapeHtml(content)}</textarea>
  `;
  item.querySelector('.btn-remove-notice').addEventListener('click', ()=> item.remove());
  noticesEditor.appendChild(item);
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
