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
const longVacationTitleText=document.getElementById('longVacationTitleText');
const longVacationPeriodText=document.getElementById('longVacationPeriodText');
const longVacationGanttWrap=document.getElementById('longVacationGanttWrap');
const longVacationGantt=document.getElementById('longVacationGantt');
const longVacationStartInput=document.getElementById('longVacationStart');
const longVacationEndInput=document.getElementById('longVacationEnd');
const longVacationBitsInput=document.getElementById('longVacationBits');
const btnLongVacationSave=document.getElementById('btnLongVacationSave');
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
const vacationVisibleToggle=document.getElementById('vacationVisibleToggle');
const btnVacationSave=document.getElementById('btnVacationSave'), btnVacationDelete=document.getElementById('btnVacationDelete'), btnVacationReload=document.getElementById('btnVacationReload'), btnVacationClear=document.getElementById('btnVacationClear');

/* 状態 */
let GROUPS=[], CONFIG_UPDATED=0, MENUS=null, STATUSES=[], requiresTimeSet=new Set(), clearOnSet=new Set(), statusClassMap=new Map();
let tokenRenewTimer=null, ro=null, remotePullTimer=null, configWatchTimer=null;
let resumeRemoteSyncOnVisible=false, resumeConfigWatchOnVisible=false;
let storeKeyBase="presence-board-v4";
const PENDING_ROWS = new Set();
let adminSelectedOfficeId='';
let currentLongVacationId='';
let currentLongVacationOfficeId='';
let cachedLongVacations={ officeId:'', list:[] };
let appliedLongVacationId='';
let appliedLongVacationOfficeId='';
let appliedLongVacationTitle='';
let longVacationGanttController=null;
let longVacationSelectedId='';

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

function coerceVacationVisibleFlag(raw){
  if(raw === true) return true;
  if(raw === false) return false;
  if(typeof raw === 'number') return raw !== 0;
  if(typeof raw === 'string'){
    const s = raw.trim().toLowerCase();
    if(!s) return false;
    return !(s === 'false' || s === '0' || s === 'off' || s === 'no' || s === 'hide');
  }
  return false;
}

function renderLongVacationRows(list, canToggle, emptyMessage){
  if(!longVacationListBody) return;
  longVacationListBody.textContent = '';
  if(!Array.isArray(list) || list.length === 0){
    const tr=document.createElement('tr');
    const td=document.createElement('td'); td.colSpan=5; td.style.textAlign='center'; td.textContent=emptyMessage||'登録された長期休暇はありません';
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
      visibleToggle.checked=coerceVacationVisibleFlag(item.visible);
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
      visibleTd.textContent = coerceVacationVisibleFlag(item.visible) ? '表示' : '非表示';
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

function longVacationSelectionKey(officeId){
  return `${storeKeyBase}:longVacation:${officeId||'__none__'}`;
}

function loadSavedLongVacationId(officeId){
  if(currentLongVacationOfficeId===officeId && currentLongVacationId) return currentLongVacationId;
  let saved='';
  try{ saved=localStorage.getItem(longVacationSelectionKey(officeId))||''; }
  catch{ saved=''; }
  currentLongVacationOfficeId=officeId||'';
  currentLongVacationId=saved||'';
  return currentLongVacationId;
}

function saveLongVacationId(officeId, id){
  currentLongVacationId=id||'';
  currentLongVacationOfficeId=officeId||'';
  try{ localStorage.setItem(longVacationSelectionKey(officeId), currentLongVacationId); }
  catch{}
}

function renderVacationRadioList(list, options){
  if(!vacationRadioList) return;
  vacationRadioList.textContent='';
  const opts=options||{};
  const onSelect = typeof opts.onSelect==='function' ? opts.onSelect : null;
  if(!Array.isArray(list) || list.length===0){
    renderVacationRadioMessage(opts.emptyMessage||'登録された長期休暇はありません');
    return;
  }

  const officeId=list[0]?.office||CURRENT_OFFICE_ID||'';
  const savedId=loadSavedLongVacationId(officeId);
  let hasSelected=false;
  const inputs=[];
  let initialSelectedItem=null;
  let initialSelectedInput=null;

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
    if(savedId && input.value===savedId){
      input.checked=true;
      hasSelected=true;
      initialSelectedItem=item;
      initialSelectedInput=input;
    }
    input.addEventListener('change', ()=>{
      saveLongVacationId(officeId, input.value);
      updateSelectionState();
      if(onSelect) onSelect(item, input.value);
    });
    inputs.push(input);

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
  if(!hasSelected && inputs.length>0){
    inputs[0].checked=true;
    saveLongVacationId(officeId, inputs[0].value);
    initialSelectedItem=list[0];
    initialSelectedInput=inputs[0];
  }
  updateSelectionState();
  if(onSelect && initialSelectedInput && initialSelectedItem){
    onSelect(initialSelectedItem, initialSelectedInput.value);
  }
}

function getLongVacationGanttController(){
  if(longVacationGanttController) return longVacationGanttController;
  if(typeof createVacationGantt !== 'function' || !longVacationGantt){
    return null;
  }
  longVacationGanttController = createVacationGantt({
    rootEl: longVacationGantt,
    startInput: longVacationStartInput,
    endInput: longVacationEndInput,
    bitsInput: longVacationBitsInput,
    autoBind: false,
    autoInit: false
  });
  if(longVacationGanttController && typeof longVacationGanttController.init==='function'){
    longVacationGanttController.init();
  }
  return longVacationGanttController;
}

function updateLongVacationDetail(item, officeId){
  const ctrl=getLongVacationGanttController();
  if(!item){
    longVacationSelectedId='';
    if(longVacationTitleText) longVacationTitleText.textContent='長期休暇';
    if(longVacationPeriodText) longVacationPeriodText.textContent='期間未設定';
    if(ctrl){
      ctrl.setRangeAndBits('', '', '');
      ctrl.applyBitsToCells();
    }
    if(officeId){
      saveLongVacationId(officeId, '');
    }
    return;
  }
  const start=item.startDate||item.start||item.from||'';
  const end=item.endDate||item.end||item.to||'';
  longVacationSelectedId=String(item.id||item.vacationId||'');
  if(longVacationTitleText) longVacationTitleText.textContent=item.title||'(無題)';
  if(longVacationPeriodText) longVacationPeriodText.textContent=(start||end)?`${start||''}〜${end||''}`:'期間未設定';
  if(ctrl){
    ctrl.setRangeAndBits(start, end, item.membersBits||item.bits||'');
    ctrl.applyBitsToCells();
  }
  if(officeId){
    saveLongVacationId(officeId, longVacationSelectedId);
  }
}

function handleLongVacationSelection(itemOrId){
  const officeId=(vacationOfficeSelect?.value)||adminSelectedOfficeId||CURRENT_OFFICE_ID||'';
  const item=typeof itemOrId==='object'&&itemOrId?itemOrId:findCachedLongVacation(officeId, itemOrId);
  updateLongVacationDetail(item||null, officeId);
}

function updateLongVacationButtonVisibility(officeId, list){
  if(!longVacationBtn) return;
  const loggedIn=!!SESSION_TOKEN;
  const targetOfficeId=officeId||CURRENT_OFFICE_ID||'';
  let sourceList=null;
  if(Array.isArray(list)){
    sourceList=list;
  }else if(cachedLongVacations.officeId===targetOfficeId){
    sourceList=cachedLongVacations.list;
  }
  const hasVisible=loggedIn && Array.isArray(sourceList)
    && sourceList.some(item=> coerceVacationVisibleFlag(item?.visible) && (!targetOfficeId || String(item.office||targetOfficeId)===targetOfficeId));
  longVacationBtn.style.display=hasVisible?'inline-block':'none';
}

async function loadLongVacations(officeId, showToastOnSuccess=false, options={}){
  let loadingTd=null;
  if(longVacationListBody){
    longVacationListBody.textContent='';
    const loadingTr=document.createElement('tr'); loadingTd=document.createElement('td'); loadingTd.colSpan=5; loadingTd.style.textAlign='center'; loadingTd.textContent='読み込み中...'; loadingTr.appendChild(loadingTd); longVacationListBody.appendChild(loadingTr);
  }
  const opts=options||{};
  const targetOfficeId=officeId||CURRENT_OFFICE_ID||'';
  if(!SESSION_TOKEN || !targetOfficeId){
    cachedLongVacations={ officeId:'', list:[] };
    if(loadingTd){ loadingTd.textContent='拠点にログインすると表示できます'; }
    updateLongVacationDetail(null, targetOfficeId);
    updateLongVacationButtonVisibility(targetOfficeId, []);
    return [];
  }
  try{
    const res=await apiPost({ action:'getVacation', token:SESSION_TOKEN, office:targetOfficeId, nocache:'1' });
    if(res?.error==='unauthorized'){
      if(typeof logout==='function'){ await logout(); }
      cachedLongVacations={ officeId:'', list:[] };
      updateLongVacationDetail(null, targetOfficeId);
      updateLongVacationButtonVisibility(targetOfficeId, []);
      return [];
    }
    const list=Array.isArray(res?.vacations)?res.vacations:(Array.isArray(res?.items)?res.items:[]);
    const normalizedList=list.map(item=>({ ...item, office: item?.office || targetOfficeId, visible: coerceVacationVisibleFlag(item?.visible) }));
    const filteredList=(isOfficeAdmin() && opts.visibleOnly!==true)
      ? normalizedList
      : normalizedList.filter(item=>item.visible===true);
    const emptyMessage = filteredList.length===0 && normalizedList.length>0
      ? '現在表示中の長期休暇はありません。管理者が「表示」に設定するとここに表示されます。'
      : '登録された長期休暇はありません';
    cachedLongVacations={ officeId: targetOfficeId, list: filteredList };
    renderLongVacationRows(filteredList, isOfficeAdmin(), emptyMessage);
    const visibleItems=filteredList.filter(item=>item.visible===true);
    const initialSelection=(opts.visibleOnly===true?visibleItems[0]:(visibleItems[0]||filteredList[0]))||null;
    if(initialSelection){
      handleLongVacationSelection(initialSelection);
      if(opts.onSelect){ opts.onSelect(initialSelection, String(initialSelection.id||initialSelection.vacationId||'')); }
    }else{
      updateLongVacationDetail(null, targetOfficeId);
      if(opts.onSelect){ opts.onSelect(null, ''); }
    }
    updateLongVacationButtonVisibility(targetOfficeId, normalizedList);
    if(showToastOnSuccess) toast('長期休暇を読み込みました');
    return filteredList;
  }catch(err){
    console.error('loadLongVacations error',err);
    cachedLongVacations={ officeId:'', list:[] };
    if(loadingTd){ loadingTd.textContent='読み込みに失敗しました'; }
    updateLongVacationDetail(null, targetOfficeId);
    updateLongVacationButtonVisibility(targetOfficeId, []);
    if(showToastOnSuccess) toast('長期休暇の取得に失敗しました', false);
    return [];
  }
}

function findCachedLongVacation(officeId, id){
  if(!id) return null;
  const targetOfficeId=officeId||'';
  if(cachedLongVacations.officeId!==targetOfficeId) return null;
  const list=Array.isArray(cachedLongVacations.list)?cachedLongVacations.list:[];
  const idStr=String(id);
  return list.find(item=> String(item?.id||item?.vacationId||'') === idStr ) || null;
}

function parseVacationMembers(bitsStr){
  const members=getRosterOrdering().flatMap(g => g.members || []);
  if(!members.length) return { memberIds: [], memberNames: '' };
  const onSet = new Set();
  (bitsStr||'').split(';').map(s => s.trim()).filter(Boolean).forEach(part => {
    const bits = part.includes(':') ? (part.split(':')[1] || '') : part;
    for(let i=0;i<bits.length && i<members.length;i++){
      if(bits[i] === '1') onSet.add(i);
    }
  });
  const memberIds = members.map(m => m.id!=null?String(m.id):'').filter((_,idx)=> onSet.has(idx) );
  return { memberIds, memberNames: summarizeVacationMembers(bitsStr) };
}

function parseVacationMembersForDate(bitsStr, targetDate, startDate, endDate){
  console.log('parseVacationMembersForDate called:', { targetDate, startDate, endDate, bitsStr });
  
  const members=getRosterOrdering().flatMap(g => g.members || []);
  if(!members.length) {
    console.warn('No members found');
    return { memberIds: [], memberNames: '' };
  }
  
  // 日付の正規化
  function normalizeDate(dateStr){
    if(!dateStr) return '';
    const d = new Date(dateStr);
    if(Number.isNaN(d.getTime())) return '';
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }
  
  const target = normalizeDate(targetDate);
  const start = normalizeDate(startDate);
  const end = normalizeDate(endDate);
  
  console.log('Normalized dates:', { target, start, end });
  
  if(!target || !start || !end) {
    console.warn('Invalid dates after normalization');
    return { memberIds: [], memberNames: '' };
  }
  
  // 対象日が期間内かチェック
  if(target < start || target > end) {
    console.warn('Target date outside range:', { target, start, end });
    return { memberIds: [], memberNames: '' };
  }
  
  // 日付スロットを生成
  const dateSlots = [];
  const current = new Date(start);
  const endD = new Date(end);
  while(current <= endD){
    dateSlots.push(normalizeDate(current));
    current.setDate(current.getDate() + 1);
  }
  
  console.log('Date slots generated:', dateSlots.length, 'slots');
  
  // 対象日のインデックスを取得
  const targetIdx = dateSlots.indexOf(target);
  console.log('Target index:', targetIdx);
  
  if(targetIdx < 0) {
    console.warn('Target date not found in slots');
    return { memberIds: [], memberNames: '' };
  }
  
  // ビット文字列をパース
  const parts = (bitsStr||'').split(';').map(s => s.trim()).filter(Boolean);
  console.log('Bits parts:', parts.length, 'parts');
  
  if(parts.length === 0 || targetIdx >= parts.length) {
    console.warn('No bits for target index:', { partsLength: parts.length, targetIdx });
    return { memberIds: [], memberNames: '' };
  }
  
  const part = parts[targetIdx];
  const bits = part.includes(':') ? (part.split(':')[1] || '') : part;
  console.log('Bits for target date:', bits);
  
  const onSet = new Set();
  for(let i=0;i<bits.length && i<members.length;i++){
    if(bits[i] === '1') onSet.add(i);
  }
  
  const memberIds = members.map(m => m.id!=null?String(m.id):'').filter((_,idx)=> onSet.has(idx) );
  const memberNames = members.filter((_,idx)=> onSet.has(idx)).map(m => m.name||'').filter(Boolean).join('、');
  
  console.log('Result:', { memberIds, memberNames, onSetSize: onSet.size });
  
  return { memberIds, memberNames };
}

function getVacationPeriodText(item){
  const start=item?.startDate||item?.start||item?.from||'';
  const end=item?.endDate||item?.end||item?.to||'';
  if(start||end) return `${start||''}〜${end||''}`;
  return '期間未設定';
}

function applyLongVacationHighlight(memberIds, vacationTitle){
  const idSet=new Set((memberIds||[]).map(id=>String(id)));
  if(!board) {
    console.warn('applyLongVacationHighlight: board element not found');
    return;
  }
  
  const title = vacationTitle || '長期休暇';
  console.log('applyLongVacationHighlight called:', { memberIds, vacationTitle: title, idSetSize: idSet.size });
  
  board.querySelectorAll('tbody tr').forEach(tr=>{
    const key=String(tr.dataset.key||'');
    const on=idSet.has(key);
    tr.classList.toggle('long-vacation-highlight', on);
    
    const statusTd = tr.querySelector('td.status');
    const statusSelect = statusTd?.querySelector('select[name="status"]');
    
    if(on) {
      console.log('Setting vacation highlight for:', key, 'title:', title);
      tr.dataset.longVacation='1';
      tr.dataset.longVacationTitle=title;
      
      // ステータス欄をテキスト表示に置き換え
      if(statusTd && statusSelect){
        // 元の値を保存（まだ保存されていない場合のみ）
        if(statusSelect.dataset.originalValue === undefined){
          statusSelect.dataset.originalValue = statusSelect.value || '';
        }
        
        // selectを非表示
        statusSelect.style.display = 'none';
        statusSelect.disabled = true;
        
        // 長期休暇タイトルを表示する要素を作成または更新
        let vacationLabel = statusTd.querySelector('.vacation-status-label');
        if(!vacationLabel){
          vacationLabel = document.createElement('div');
          vacationLabel.className = 'vacation-status-label';
          statusTd.appendChild(vacationLabel);
        }
        vacationLabel.textContent = title;
        vacationLabel.style.display = 'block';
        
        // 内部的にステータスを「休み」に設定
        statusSelect.value = '休み';
        // recolorを呼び出して行の色を更新
        const statusClassMap = new Map([
          ['在席','st-here'], ['外出','st-out'], ['会議','st-meeting'],
          ['在宅勤務','st-remote'], ['出張','st-trip'], ['研修','st-training'],
          ['健康診断','st-health'], ['コアドック','st-coadoc'], ['帰宅','st-home'], ['休み','st-off']
        ]);
        statusClassMap.forEach(cls=>tr.classList.remove(cls));
        tr.classList.add('st-off');
        tr.dataset.status='休み';
      }
    } else {
      delete tr.dataset.longVacation;
      delete tr.dataset.longVacationTitle;
      
      // ステータス欄を元に戻す
      if(statusTd && statusSelect){
        statusSelect.style.display = '';
        statusSelect.disabled = false;
        
        const vacationLabel = statusTd.querySelector('.vacation-status-label');
        if(vacationLabel){
          vacationLabel.style.display = 'none';
        }
        
        // 元の値を復元
        if(statusSelect.dataset.originalValue !== undefined){
          const originalValue = statusSelect.dataset.originalValue;
          statusSelect.value = originalValue;
          delete statusSelect.dataset.originalValue;
          
          // 行の色を更新
          const statusClassMap = new Map([
            ['在席','st-here'], ['外出','st-out'], ['会議','st-meeting'],
            ['在宅勤務','st-remote'], ['出張','st-trip'], ['研修','st-training'],
            ['健康診断','st-health'], ['コアドック','st-coadoc'], ['帰宅','st-home'], ['休み','st-off']
          ]);
          statusClassMap.forEach(cls=>tr.classList.remove(cls));
          const cls = statusClassMap.get(originalValue);
          if(cls) tr.classList.add(cls);
          tr.dataset.status = originalValue;
        }
      }
    }
  });
  
  console.log('applyLongVacationHighlight completed');
}

function updateLongVacationBanner(item, memberNames){
  const wrap=document.querySelector('.wrap');
  if(!wrap) return;
  let banner=document.getElementById('longVacationBanner');
  if(!banner){
    banner=document.createElement('div');
    banner.id='longVacationBanner';
    banner.className='long-vacation-banner';
    wrap.insertBefore(banner, wrap.firstChild);
  }
  if(!item){
    banner.style.display='none';
    banner.textContent='';
    return;
  }
  const period=getVacationPeriodText(item);
  const membersText=memberNames||summarizeVacationMembers(item.membersBits||item.bits||'')||'対象メンバーなし';
  banner.innerHTML='';
  const titleEl=document.createElement('div');
  titleEl.className='long-vacation-banner__title';
  titleEl.textContent=`長期休暇表示中：${item.title||'(無題)'}`;
  const detailEl=document.createElement('div');
  detailEl.className='long-vacation-banner__detail';
  detailEl.textContent=`期間 ${period}`;
  const membersEl=document.createElement('div');
  membersEl.className='long-vacation-banner__members';
  membersEl.textContent=`対象：${membersText}`;
  banner.append(titleEl, detailEl, membersEl);
  banner.style.display='block';
}

async function saveLongVacationFromModal(){
  const officeId=(vacationOfficeSelect?.value)||adminSelectedOfficeId||CURRENT_OFFICE_ID||'';
  const selectedId=longVacationSelectedId || currentLongVacationId || '';
  if(!officeId || !selectedId){ toast('表示する長期休暇を取得できませんでした', false); return false; }
  const item=findCachedLongVacation(officeId, selectedId);
  if(!item){ toast('長期休暇の情報を取得できませんでした', false); return false; }
  const ctrl=getLongVacationGanttController();
  const membersBits=ctrl?ctrl.getBitsString():(longVacationBitsInput?.value||'');
  const payload={
    office: officeId,
    title: item.title||'',
    start: item.startDate||item.start||item.from||'',
    end: item.endDate||item.end||item.to||'',
    note: item.note||item.memo||'',
    membersBits,
    visible: true
  };
  const id=item.id||item.vacationId||selectedId;
  if(id) payload.id=id;
  try{
    const res=await adminSetVacation(officeId,payload);
    if(res && res.ok!==false){
      toast('長期休暇を保存しました');
      await loadLongVacations(officeId, false, { visibleOnly:true, onSelect: handleLongVacationSelection });
      await applyLongVacationDisplay(id);
      return true;
    }
    throw new Error(res&&res.error?String(res.error):'save_failed');
  }catch(err){
    console.error('saveLongVacationFromModal error', err);
    toast('長期休暇の保存に失敗しました', false);
    return false;
  }
}

async function applyLongVacationDisplay(selectedId){
  const id=String(selectedId||'').trim();
  const officeId=(vacationOfficeSelect?.value)||adminSelectedOfficeId||CURRENT_OFFICE_ID||'';
  if(!id || !officeId){ toast('長期休暇を選択できませんでした', false); return false; }
  let item=findCachedLongVacation(officeId, id);
  if(!item){
    await loadLongVacations(officeId);
    item=findCachedLongVacation(officeId, id);
  }
  if(!item){
    toast('長期休暇の情報を取得できませんでした', false);
    return false;
  }
  
  // 今日の日付を取得
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
  
  // 今日の日付に対してビットが立っているメンバーのみを取得
  const { memberIds, memberNames } = parseVacationMembersForDate(
    item.membersBits||item.bits||'',
    todayStr,
    item.startDate||item.start||item.from||'',
    item.endDate||item.end||item.to||''
  );
  
  applyLongVacationHighlight(memberIds, item.title||'長期休暇');
  appliedLongVacationId=String(item.id||item.vacationId||id);
  appliedLongVacationOfficeId=item.office||officeId;
  appliedLongVacationTitle=item.title||'長期休暇';
  saveLongVacationId(appliedLongVacationOfficeId, appliedLongVacationId);
  return true;
}

async function clearLongVacationDisplay(){
  appliedLongVacationId='';
  appliedLongVacationOfficeId='';
  appliedLongVacationTitle='';
  applyLongVacationHighlight([]);
  saveLongVacationId(CURRENT_OFFICE_ID, '');
  return true;
}

async function autoApplySavedLongVacation(){
  console.log('autoApplySavedLongVacation called');
  const officeId = CURRENT_OFFICE_ID || '';
  if(!officeId) {
    console.log('No office ID, skipping auto-apply');
    return;
  }
  
  const savedId = loadSavedLongVacationId(officeId);
  console.log('Saved vacation ID:', savedId);
  
  if(!savedId) {
    console.log('No saved vacation ID, skipping auto-apply');
    return;
  }
  
  // ボードが存在するまで待機（最大3秒）
  let retries = 0;
  const maxRetries = 30;
  while(!board && retries < maxRetries){
    await new Promise(resolve => setTimeout(resolve, 100));
    retries++;
  }
  
  if(!board) {
    console.warn('Board not ready after waiting, skipping auto-apply');
    return;
  }
  
  console.log('Applying saved vacation:', savedId);
  try{
    await applyLongVacationDisplay(savedId);
    console.log('Auto-apply completed successfully');
  }catch(err){
    console.error('Auto-apply failed:', err);
  }
}

/* レイアウト（JS + CSS両方で冗長に制御） */
const PANEL_MIN_PX=760,GAP_PX=20,MAX_COLS=3;
const CARD_BREAKPOINT_PX=760; // これより狭い幅ではカード表示を強制
