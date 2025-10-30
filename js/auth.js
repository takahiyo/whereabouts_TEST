/* 認証UI + 管理UI + マニュアルUI */
function logoutButtonsCleanup(){
  closeMenu(); showAdminModal(false); showManualModal(false);
  board.style.display='none'; board.replaceChildren(); menuList.replaceChildren();
  window.scrollTo(0,0);
}
async function logout(){
  try{
    if(tokenRenewTimer){ clearTimeout(tokenRenewTimer); tokenRenewTimer=null; }
    if(configWatchTimer){ clearInterval(configWatchTimer); configWatchTimer=null; }
    if(remotePullTimer){ clearInterval(remotePullTimer); remotePullTimer=null; }
    if(ro){ try{ ro.disconnect(); }catch{} }
  }catch{}
  logoutButtonsCleanup();
  SESSION_TOKEN=""; sessionStorage.removeItem(SESSION_KEY); sessionStorage.removeItem(SESSION_ROLE_KEY);
  sessionStorage.removeItem(SESSION_OFFICE_KEY); sessionStorage.removeItem(SESSION_OFFICE_NAME_KEY);
  CURRENT_OFFICE_NAME=""; CURRENT_OFFICE_ID=""; CURRENT_ROLE="user";
    adminSelectedOfficeId='';
  if(adminOfficeSel){ adminOfficeSel.textContent=''; adminOfficeSel.disabled=false; }
  if(adminOfficeRow){ adminOfficeRow.style.display='none'; }
  titleBtn.textContent='在席確認表';
  ensureAuthUI();
  try{ await refreshPublicOfficeSelect(); }
  catch{ ensureAuthUIPublicError(); }
  finally{ loginEl.style.display='flex'; }
}
function ensureAuthUI(){
  const loggedIn = !!SESSION_TOKEN;
  const showAdmin = loggedIn && isOfficeAdmin();
  adminBtn.style.display   = showAdmin ? 'inline-block' : 'none';
  logoutBtn.style.display  = loggedIn ? 'inline-block' : 'none';
  manualBtn.style.display  = loggedIn ? 'inline-block' : 'none';
  nameFilter.style.display = loggedIn ? 'inline-block' : 'none';
  statusFilter.style.display = loggedIn ? 'inline-block' : 'none';
}
function showAdminModal(yes){ adminModal.classList.toggle('show', !!yes); }
async function applyRoleToAdminPanel(){
  if(!(adminOfficeRow&&adminOfficeSel)) return;
  if(CURRENT_ROLE!=='superAdmin'){
    adminOfficeRow.style.display='none';
    adminOfficeSel.disabled=false;
    adminOfficeSel.textContent='';
    adminSelectedOfficeId='';
    return;
  }

  adminOfficeRow.style.display='';
  adminOfficeSel.disabled=true;
  adminOfficeSel.textContent='';
  const loadingOpt=document.createElement('option');
  loadingOpt.value=''; loadingOpt.disabled=true; loadingOpt.selected=true; loadingOpt.textContent='読込中…';
  adminOfficeSel.appendChild(loadingOpt);

  let offices=[];
  try{
    const res=await apiPost({ action:'listOffices', token:SESSION_TOKEN });
    if(res && res.ok!==false && Array.isArray(res.offices)){
      offices=res.offices;
    }else{
      throw new Error(res&&res.error?String(res.error):'unexpected_response');
    }
  }catch(err){
    console.error('listOffices failed',err);
    adminOfficeSel.textContent='';
    const opt=document.createElement('option');
    opt.value=''; opt.disabled=true; opt.selected=true; opt.textContent='取得に失敗しました';
    adminOfficeSel.appendChild(opt);
    adminSelectedOfficeId='';
    adminOfficeSel.disabled=false;
    toast('拠点一覧の取得に失敗しました',false);
    return;
  }

  adminOfficeSel.textContent='';
  const seen=new Set();
  let desiredId=adminSelectedOfficeId||CURRENT_OFFICE_ID||'';
  let hasDesired=false;

  offices.forEach(o=>{
    if(!o) return;
    const id=String(o.id||'').trim();
    if(!id||seen.has(id)) return;
    seen.add(id);
    const opt=document.createElement('option');
    opt.value=id;
    opt.textContent=stripCtl(o.name==null?id:String(o.name))||id;
    adminOfficeSel.appendChild(opt);
    if(id===desiredId) hasDesired=true;
  });

  if(adminOfficeSel.options.length===0){
    const opt=document.createElement('option');
    opt.value=''; opt.disabled=true; opt.selected=true; opt.textContent='拠点がありません';
    adminOfficeSel.appendChild(opt);
    adminSelectedOfficeId='';
    adminOfficeSel.disabled=false;
    return;
  }

  if(!hasDesired){
    if(CURRENT_OFFICE_ID && seen.has(CURRENT_OFFICE_ID)) desiredId=CURRENT_OFFICE_ID;
    else desiredId=adminOfficeSel.options[0].value||'';
  }

  if(desiredId){ adminOfficeSel.value=desiredId; }
  if(adminOfficeSel.selectedIndex<0){ adminOfficeSel.selectedIndex=0; desiredId=adminOfficeSel.value||''; }
  adminSelectedOfficeId=desiredId||'';
  adminOfficeSel.disabled=false;
}
function showManualModal(yes){ manualModal.classList.toggle('show', !!yes); }
function applyRoleToManual(){
  const isAdmin = isOfficeAdmin();
  manualUser.style.display = '';
  manualAdmin.style.display = isAdmin ? '' : 'none';
}

/* 管理/マニュアルUIイベント */
adminBtn.addEventListener('click', async ()=>{
  applyRoleToAdminPanel();
  showAdminModal(true);
});
adminClose.addEventListener('click', ()=> showAdminModal(false));
logoutBtn.addEventListener('click', logout);

manualBtn.addEventListener('click', ()=>{ applyRoleToManual(); showManualModal(true); });
manualClose.addEventListener('click', ()=> showManualModal(false));
document.addEventListener('keydown', (e)=>{ if(e.key==='Escape'){ showAdminModal(false); showManualModal(false); closeMenu(); }});
