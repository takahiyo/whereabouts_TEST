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
const noticesBtn=document.getElementById('noticesBtn'), adminBtn=document.getElementById('adminBtn'), logoutBtn=document.getElementById('logoutBtn'), adminModal=document.getElementById('adminModal'), adminClose=document.getElementById('adminClose');
const longVacationBtn=document.getElementById('longVacationBtn'), longVacationModal=document.getElementById('longVacationModal'), longVacationClose=document.getElementById('longVacationClose');
const longVacationListBody=document.getElementById('longVacationListBody');
const vacationRadioList=document.getElementById('vacationRadioList');
const btnApplyVacationDisplay=document.getElementById('btnApplyVacationDisplay');
const btnClearVacationDisplay=document.getElementById('btnClearVacationDisplay');
const btnExport=document.getElementById('btnExport'), csvFile=document.getElementById('csvFile'), btnImport=document.getElementById('btnImport');
const renameOfficeName=document.getElementById('renameOfficeName'), btnRenameOffice=document.getElementById('btnRenameOffice');
const setPw=document.getElementById('setPw'), setAdminPw=document.getElementById('setAdminPw'), btnSetPw=document.getElementById('btnSetPw');
const adminOfficeRow=document.getElementById('adminOfficeRow'), adminOfficeSel=document.getElementById('adminOfficeSel');
const manualBtn=document.getElementById('manualBtn'), manualModal=document.getElementById('manualModal'), manualClose=document.getElementById('manualClose'), manualUser=document.getElementById('manualUser'), manualAdmin=document.getElementById('manualAdmin');
const nameFilter=document.getElementById('nameFilter'), statusFilter=document.getElementById('statusFilter');
const noticesEditor=document.getElementById('noticesEditor'), btnAddNotice=document.getElementById('btnAddNotice'), btnLoadNotices=document.getElementById('btnLoadNotices'), btnSaveNotices=document.getElementById('btnSaveNotices');
const vacationTitleInput=document.getElementById('vacationTitle'), vacationStartInput=document.getElementById('vacationStart'), vacationEndInput=document.getElementById('vacationEnd');
const vacationNoteInput=document.getElementById('vacationNote'), vacationOfficeSelect=document.getElementById('vacationOffice'), vacationMembersBitsInput=document.getElementById('vacationMembersBits');
const vacationIdInput=document.getElementById('vacationId'), vacationListBody=document.getElementById('vacationListBody');
const btnVacationSave=document.getElementById('btnVacationSave'), btnVacationDelete=document.getElementById('btnVacationDelete'), btnVacationReload=document.getElementById('btnVacationReload'), btnVacationClear=document.getElementById('btnVacationClear');

/* 状態 */
let GROUPS=[], CONFIG_UPDATED=0, MENUS=null, STATUSES=[], requiresTimeSet=new Set(), clearOnSet=new Set(), statusClassMap=new Map();
let tokenRenewTimer=null, ro=null, remotePullTimer=null, configWatchTimer=null;
let resumeRemoteSyncOnVisible=false, resumeConfigWatchOnVisible=false;
let storeKeyBase="presence-board-v4";
const PENDING_ROWS = new Set();
let adminSelectedOfficeId='';

/* 認証状態 */
let SESSION_TOKEN=""; let CURRENT_OFFICE_NAME=""; let CURRENT_OFFICE_ID=""; let CURRENT_ROLE="user";

document.addEventListener('visibilitychange', ()=>{
  if(document.hidden){
    resumeRemoteSyncOnVisible = remotePullTimer != null;
    resumeConfigWatchOnVisible = configWatchTimer != null;
    clearInterval(remotePullTimer);
    clearInterval(configWatchTimer);
    remotePullTimer = null;
    configWatchTimer = null;
  }else{
    if(resumeRemoteSyncOnVisible && SESSION_TOKEN){
      startRemoteSync(true);
    }
    if(resumeConfigWatchOnVisible && SESSION_TOKEN){
      startConfigWatch();
    }
    resumeRemoteSyncOnVisible = false;
    resumeConfigWatchOnVisible = false;
  }
});
function isOfficeAdmin(){ return CURRENT_ROLE==='officeAdmin' || CURRENT_ROLE==='superAdmin'; }

function getRosterOrdering(){
  if(!Array.isArray(GROUPS)) return [];
  return GROUPS.map(g => ({
    title: g.title || '',
    members: Array.isArray(g.members) ? g.members : []
  }));
}

/* 長期休暇の表示 */
function summarizeVacationMembers(bitsStr){
  if(!bitsStr || typeof getRosterOrdering !== 'function') return '';
  const members = getRosterOrdering().flatMap(g => g.members || []);
  if(!members.length) return '';
  const onSet = new Set();
  bitsStr.split(';').map(s => s.trim()).filter(Boolean).forEach(part => {
    const bits = part.includes(':') ? (part.split(':')[1] || '') : part;
    for(let i=0;i<bits.length && i<members.length;i++){
      if(bits[i] === '1') onSet.add(i);
    }
  });
  const names = members.map(m => m.name || '').filter((_,idx)=> onSet.has(idx));
  if(names.length === 0) return '';
  if(names.length <= 3) return names.join('、');
  return `${names.slice(0,3).join('、')} ほか${names.length-3}名`;
}

function renderLongVacationRows(list, canToggle){
  if(!longVacationListBody) return;
  longVacationListBody.textContent = '';
  if(!Array.isArray(list) || list.length === 0){
    const tr=document.createElement('tr');
    const td=document.createElement('td'); td.colSpan=5; td.style.textAlign='center'; td.textContent='登録された長期休暇はありません';
    tr.appendChild(td); longVacationListBody.appendChild(tr); return;
  }
  list.forEach(item => {
    const tr=document.createElement('tr');
    const titleTd=document.createElement('td'); titleTd.textContent=item.title||'';
    const start=item.startDate||item.start||item.from||'';
    const end=item.endDate||item.end||item.to||'';
    const period=start||end?`${start||''}〜${end||''}`:'-';
    const periodTd=document.createElement('td'); periodTd.textContent=period;
    const membersText=summarizeVacationMembers(item.membersBits||item.bits||'');
    const membersTd=document.createElement('td'); membersTd.textContent=membersText||'—';
    const noteTd=document.createElement('td'); noteTd.textContent=item.note||item.memo||'';
    const visibleTd=document.createElement('td');
    if(canToggle){
      const visibleToggle=document.createElement('input');
      visibleToggle.type='checkbox';
      visibleToggle.checked=item.visible !== false;
      visibleToggle.addEventListener('change', async ()=>{
        visibleToggle.disabled=true;
        const updater=typeof updateVacationVisibility==='function'?updateVacationVisibility:null;
        let success=true;
        if(updater){ success=await updater(item, visibleToggle.checked); }
        if(!success){
          visibleToggle.checked=!visibleToggle.checked;
        }
        visibleToggle.disabled=false;
      });
      visibleTd.appendChild(visibleToggle);
    }else{
      visibleTd.textContent = item.visible !== false ? '表示' : '非表示';
    }
    tr.append(titleTd,periodTd,membersTd,noteTd,visibleTd);
    longVacationListBody.appendChild(tr);
  });
}

function renderVacationRadioMessage(message){
  if(!vacationRadioList) return;
  vacationRadioList.textContent='';
  const div=document.createElement('div');
  div.style.textAlign='center';
  div.style.padding='20px';
  div.style.color='#6b7280';
  div.textContent=message;
  vacationRadioList.appendChild(div);
}

function renderVacationRadioList(list){
  if(!vacationRadioList) return;
  vacationRadioList.textContent='';
  if(!Array.isArray(list) || list.length===0){
    renderVacationRadioMessage('登録された長期休暇はありません');
    return;
  }

  const updateSelectionState=()=>{
    vacationRadioList.querySelectorAll('.vacation-radio-item').forEach(item=>{
      const input=item.querySelector('input[type="radio"]');
      item.classList.toggle('selected', !!(input&&input.checked));
    });
  };

  list.forEach((item, idx)=>{
    const radioId=`vacation-radio-${item.id||item.vacationId||idx}`;
    const wrapper=document.createElement('label');
    wrapper.className='vacation-radio-item';

    const input=document.createElement('input');
    input.type='radio';
    input.name='vacationRadio';
    input.id=radioId;
    input.value=String(item.id||item.vacationId||idx);
    input.addEventListener('change', updateSelectionState);

    const content=document.createElement('div');
    content.className='vacation-radio-content';

    const titleDiv=document.createElement('div');
    titleDiv.className='vacation-radio-title';
    titleDiv.textContent=item.title||'';

    const start=item.startDate||item.start||item.from||'';
    const end=item.endDate||item.end||item.to||'';
    const period=start||end?`${start||''}〜${end||''}`:'-';
    const periodDiv=document.createElement('div');
    periodDiv.className='vacation-radio-period';
    periodDiv.textContent=period;

    const membersText=summarizeVacationMembers(item.membersBits||item.bits||'');
    if(membersText){
      const membersDiv=document.createElement('div');
      membersDiv.className='vacation-radio-members';
      membersDiv.textContent=membersText;
      content.append(titleDiv, periodDiv, membersDiv);
    }else{
      content.append(titleDiv, periodDiv);
    }

    wrapper.append(input, content);
    vacationRadioList.appendChild(wrapper);
  });
  updateSelectionState();
}

async function loadLongVacations(officeId, showToastOnSuccess=false){
  let loadingTd=null;
  if(longVacationListBody){
    longVacationListBody.textContent='';
    const loadingTr=document.createElement('tr'); loadingTd=document.createElement('td'); loadingTd.colSpan=5; loadingTd.style.textAlign='center'; loadingTd.textContent='読み込み中...'; loadingTr.appendChild(loadingTd); longVacationListBody.appendChild(loadingTr);
  }
  renderVacationRadioMessage('読み込み中...');
  const targetOfficeId=officeId||CURRENT_OFFICE_ID||'';
  if(!SESSION_TOKEN || !targetOfficeId){
    if(loadingTd){ loadingTd.textContent='拠点にログインすると表示できます'; }
    renderVacationRadioMessage('拠点にログインすると表示できます');
    return;
  }
  try{
    const res=await apiPost({ action:'getVacation', token:SESSION_TOKEN, office:targetOfficeId, nocache:'1' });
    if(res?.error==='unauthorized'){
      if(typeof logout==='function'){ await logout(); }
      renderVacationRadioMessage('拠点にログインすると表示できます');
      return;
    }
    const list=Array.isArray(res?.vacations)?res.vacations:(Array.isArray(res?.items)?res.items:[]);
    const normalizedList=list.map(item=>({ ...item, office: item?.office || targetOfficeId }));
    const filteredList=isOfficeAdmin()?normalizedList:normalizedList.filter(item=>item.visible!==false);
    renderLongVacationRows(filteredList, isOfficeAdmin());
    renderVacationRadioList(filteredList);
    if(showToastOnSuccess) toast('長期休暇を読み込みました');
  }catch(err){
    console.error('loadLongVacations error',err);
    if(loadingTd){ loadingTd.textContent='読み込みに失敗しました'; }
    renderVacationRadioMessage('読み込みに失敗しました');
    if(showToastOnSuccess) toast('長期休暇の取得に失敗しました', false);
  }
}

/* レイアウト（JS + CSS両方で冗長に制御） */
const PANEL_MIN_PX=760,GAP_PX=20,MAX_COLS=3;
const CARD_BREAKPOINT_PX=760; // これより狭い幅ではカード表示を強制
