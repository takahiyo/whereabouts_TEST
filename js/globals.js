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
const eventBtn=document.getElementById('eventBtn'), eventModal=document.getElementById('eventModal'), eventClose=document.getElementById('eventClose');
const vacationRadioList=document.getElementById('vacationRadioList');
const eventModalTitle=document.getElementById('eventModalTitle');
const eventTitleText=document.getElementById('eventTitleText');
const eventPeriodText=document.getElementById('eventPeriodText');
const eventGanttWrap=document.getElementById('eventGanttWrap');
const eventGantt=document.getElementById('eventGantt');
const eventGroupJumps=document.getElementById('eventGroupJumps');
const eventStartInput=document.getElementById('eventStart');
const eventEndInput=document.getElementById('eventEnd');
const eventBitsInput=document.getElementById('eventBits');
const btnEventSave=document.getElementById('btnEventSave');
const btnApplyEventDisplay=document.getElementById('btnApplyEventDisplay');
const btnClearEventDisplay=document.getElementById('btnClearEventDisplay');
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
const vacationTypeText=document.getElementById('vacationTypeText');
const vacationColorSelect=document.getElementById('vacationColor');
const btnVacationSave=document.getElementById('btnVacationSave'), btnVacationDelete=document.getElementById('btnVacationDelete'), btnVacationReload=document.getElementById('btnVacationReload'), btnVacationClear=document.getElementById('btnVacationClear');

/* 状態 */
let GROUPS=[], CONFIG_UPDATED=0, MENUS=null, STATUSES=[], requiresTimeSet=new Set(), clearOnSet=new Set(), statusClassMap=new Map();
let tokenRenewTimer=null, ro=null, remotePullTimer=null, configWatchTimer=null;
let resumeRemoteSyncOnVisible=false, resumeConfigWatchOnVisible=false;
let storeKeyBase="presence-board-v4";
const PENDING_ROWS = new Set();
let adminSelectedOfficeId='';
let currentEventIds=[];
let currentEventOfficeId='';
let cachedEvents={ officeId:'', list:[] };
let appliedEventIds=[];
let appliedEventOfficeId='';
let appliedEventTitles=[];
let eventGanttController=null;
let eventSelectedId='';
let selectedEventIds=[];

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

/* イベントの表示 */
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

function renderVacationRadioMessage(message){
  if(!vacationRadioList) return;
  vacationRadioList.style.display='block';
  vacationRadioList.textContent='';
  const div=document.createElement('div');
  div.style.textAlign='center';
  div.style.padding='20px';
  div.style.color='#6b7280';
  div.textContent=message;
  vacationRadioList.appendChild(div);
}

const EVENT_COLOR_KEYS=['amber','blue','green','pink','purple','teal','gray'];
const EVENT_COLOR_LABELS={
  amber:'サニー',
  blue:'ブルー',
  green:'グリーン',
  pink:'ピンク',
  purple:'パープル',
  teal:'ティール',
  gray:'グレー'
};

function getEventColorClass(color){
  const key=(color||'').toString().trim().toLowerCase();
  if(!key) return '';
  return `event-color-${key}`;
}

function eventSelectionKey(officeId){
  return `${storeKeyBase}:event:${officeId||'__none__'}`;
}

function loadSavedEventIds(officeId){
  if(currentEventOfficeId===officeId && Array.isArray(currentEventIds)) return currentEventIds;
  let saved=[];
  try{
    const raw=localStorage.getItem(eventSelectionKey(officeId))||'[]';
    const parsed=JSON.parse(raw);
    saved=Array.isArray(parsed)?parsed.map(v=>String(v)).filter(Boolean):[];
  }
  catch{ saved=[]; }
  currentEventOfficeId=officeId||'';
  currentEventIds=saved;
  return currentEventIds;
}

function saveEventIds(officeId, ids){
  const uniqIds=Array.from(new Set((ids||[]).map(v=>String(v).trim()).filter(Boolean)));
  currentEventIds=uniqIds;
  currentEventOfficeId=officeId||'';
  try{ localStorage.setItem(eventSelectionKey(officeId), JSON.stringify(uniqIds)); }
  catch{}
}

function renderVacationRadioList(list, options){
  if(!vacationRadioList) return;
  vacationRadioList.textContent='';
  const opts=options||{};
  const onSelectChange = typeof opts.onSelectChange==='function' ? opts.onSelectChange : null;
  const onFocus = typeof opts.onFocus==='function' ? opts.onFocus : null;
  const selectedIds = new Set((opts.selectedIds||[]).map(v=>String(v)));
  if(!Array.isArray(list) || list.length===0){
    renderVacationRadioMessage(opts.emptyMessage||'登録されたイベントはありません');
    return;
  }

  const officeId=list[0]?.office||CURRENT_OFFICE_ID||'';
  vacationRadioList.style.display='flex';

  list.forEach((item, idx)=>{
    const id=String(item.id||item.vacationId||idx);
    const checkboxId=`vacation-check-${id}`;
    const wrapper=document.createElement('label');
    wrapper.className='vacation-radio-item multi';

    const input=document.createElement('input');
    input.type='checkbox';
    input.name='vacationCheckbox';
    input.id=checkboxId;
    input.value=id;
    input.checked=selectedIds.has(id);
    input.addEventListener('change', ()=>{
      const nextIds=new Set(selectedIds);
      if(input.checked){ nextIds.add(id); }
      else { nextIds.delete(id); }
      const arr=Array.from(nextIds);
      selectedIds.clear(); arr.forEach(v=>selectedIds.add(v));
      saveEventIds(officeId, arr);
      selectedEventIds=arr;
      if(onSelectChange) onSelectChange(arr, item, id, input.checked);
    });

    const content=document.createElement('div');
    content.className='vacation-radio-content';

    const metaRow=document.createElement('div');
    metaRow.className='vacation-radio-meta';
    const colorDot=document.createElement('span');
    colorDot.className=`event-color-dot ${getEventColorClass(item.color)}`.trim();
    colorDot.title=EVENT_COLOR_LABELS[item.color]||'';
    const typeBadge=document.createElement('span');
    typeBadge.className='event-type-badge';
    typeBadge.textContent=item.isVacation===false?'予定のみ':'休暇固定';
    metaRow.append(colorDot, typeBadge);

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
      content.append(metaRow, titleDiv, periodDiv, membersDiv);
    }else{
      content.append(metaRow, titleDiv, periodDiv);
    }

    wrapper.append(input, content);
    wrapper.addEventListener('click', (e)=>{
      if(e.target===input) return;
      if(onFocus) onFocus(item, id);
    });
    vacationRadioList.appendChild(wrapper);
  });

  const firstSelected=list.find(item=> selectedIds.has(String(item.id||item.vacationId||'')));
  if(firstSelected && onFocus){
    onFocus(firstSelected, String(firstSelected.id||firstSelected.vacationId||''));
  }
}

function getEventGanttController(){
  if(eventGanttController) return eventGanttController;
  if(typeof createVacationGantt !== 'function' || !eventGantt){
    return null;
  }
  eventGanttController = createVacationGantt({
    rootEl: eventGantt,
    startInput: eventStartInput,
    endInput: eventEndInput,
    bitsInput: eventBitsInput,
    autoBind: false,
    autoInit: false,
    groupJumpContainer: eventGroupJumps,
    scrollContainer: eventGantt,
    groupJumpMode: 'select'
  });
  if(eventGanttController && typeof eventGanttController.init==='function'){
    eventGanttController.init();
  }
  return eventGanttController;
}

function updateEventDetail(item, officeId){
  const ctrl=getEventGanttController();
  if(!item){
    eventSelectedId='';
    if(eventModalTitle) eventModalTitle.textContent='イベント';
    if(eventTitleText) eventTitleText.textContent='イベント';
    if(eventPeriodText) eventPeriodText.textContent='期間未設定';
    if(ctrl){
      ctrl.setRangeAndBits('', '', '');
      ctrl.applyBitsToCells();
    }
    return;
  }
  const start=item.startDate||item.start||item.from||'';
  const end=item.endDate||item.end||item.to||'';
  eventSelectedId=String(item.id||item.vacationId||'');
  const title=item.title||'(無題)';
  if(eventModalTitle) eventModalTitle.textContent=title;
  if(eventTitleText) eventTitleText.textContent=title;
  if(eventPeriodText) eventPeriodText.textContent=(start||end)?`${start||''}〜${end||''}`:'期間未設定';
  if(ctrl){
    ctrl.setRangeAndBits(start, end, item.membersBits||item.bits||'');
    ctrl.applyBitsToCells();
  }
}

function handleEventSelection(itemOrId){
  const officeId=(vacationOfficeSelect?.value)||adminSelectedOfficeId||CURRENT_OFFICE_ID||'';
  const item=typeof itemOrId==='object'&&itemOrId?itemOrId:findCachedEvent(officeId, itemOrId);
  updateEventDetail(item||null, officeId);
}

function updateEventButtonVisibility(officeId, list){
  if(!eventBtn) return;
  const loggedIn=!!SESSION_TOKEN;
  const targetOfficeId=officeId||CURRENT_OFFICE_ID||'';
  let sourceList=null;
  if(Array.isArray(list)){
    sourceList=list;
  }else if(cachedEvents.officeId===targetOfficeId){
    sourceList=cachedEvents.list;
  }
  const hasVisible=loggedIn && Array.isArray(sourceList)
    && sourceList.some(item=> coerceVacationVisibleFlag(item?.visible) && (!targetOfficeId || String(item.office||targetOfficeId)===targetOfficeId));
  eventBtn.style.display=hasVisible?'inline-block':'none';
}

async function loadEvents(officeId, showToastOnSuccess=false, options={}){
  const opts=options||{};
  const targetOfficeId=officeId||CURRENT_OFFICE_ID||'';
  renderVacationRadioMessage('読み込み中...');
  if(!SESSION_TOKEN || !targetOfficeId){
    cachedEvents={ officeId:'', list:[] };
    renderVacationRadioMessage('拠点にログインすると表示できます');
    updateEventDetail(null, targetOfficeId);
    updateEventButtonVisibility(targetOfficeId, []);
    selectedEventIds=[];
    updateEventLegend([]);
    return [];
  }
  try{
    const res=await apiPost({ action:'getVacation', token:SESSION_TOKEN, office:targetOfficeId, nocache:'1' });
    if(res?.error==='unauthorized'){
      if(typeof logout==='function'){ await logout(); }
      cachedEvents={ officeId:'', list:[] };
      updateEventDetail(null, targetOfficeId);
      updateEventButtonVisibility(targetOfficeId, []);
      return [];
    }
    const list=Array.isArray(res?.vacations)?res.vacations:(Array.isArray(res?.items)?res.items:[]);
    const normalizedList=list.map(item=>({
      ...item,
      office: item?.office || targetOfficeId,
      visible: coerceVacationVisibleFlag(item?.visible),
      isVacation: item?.isVacation !== false,
      color: item?.color || 'amber'
    }));
    const filteredList=(isOfficeAdmin() && opts.visibleOnly!==true)
      ? normalizedList
      : normalizedList.filter(item=>item.visible===true);
    const emptyMessage = filteredList.length===0 && normalizedList.length>0
      ? '現在表示中のイベントはありません。管理者が「表示」に設定するとここに表示されます。'
      : '登録されたイベントはありません';
    const savedIds=loadSavedEventIds(targetOfficeId);
    selectedEventIds=savedIds;
    cachedEvents={ officeId: targetOfficeId, list: filteredList };
    renderVacationRadioList(filteredList, {
      selectedIds: savedIds,
      emptyMessage,
      onSelectChange: (ids)=>{
        selectedEventIds=ids;
        saveEventIds(targetOfficeId, ids);
        updateEventLegend(ids.map(id=>findCachedEvent(targetOfficeId, id)).filter(Boolean));
      },
      onFocus: handleEventSelection
    });
    const visibleItems=filteredList.filter(item=>item.visible===true);
    const initialSelection=savedIds.map(id=>findCachedEvent(targetOfficeId, id)).find(Boolean)
      || (opts.visibleOnly===true?visibleItems[0]:(visibleItems[0]||filteredList[0]))
      || null;
    if(initialSelection){
      handleEventSelection(initialSelection);
      if(opts.onSelect){ opts.onSelect(initialSelection, String(initialSelection.id||initialSelection.vacationId||'')); }
    }else{
      updateEventDetail(null, targetOfficeId);
      if(opts.onSelect){ opts.onSelect(null, ''); }
    }
    updateEventLegend(savedIds.map(id=>findCachedEvent(targetOfficeId, id)).filter(Boolean));
    updateEventButtonVisibility(targetOfficeId, normalizedList);
    if(showToastOnSuccess) toast('イベントを読み込みました');
    return filteredList;
  }catch(err){
    console.error('loadEvents error',err);
    cachedEvents={ officeId:'', list:[] };
    renderVacationRadioMessage('読み込みに失敗しました');
    updateEventDetail(null, targetOfficeId);
    updateEventButtonVisibility(targetOfficeId, []);
    if(showToastOnSuccess) toast('イベントの取得に失敗しました', false);
    return [];
  }
}

function findCachedEvent(officeId, id){
  if(!id) return null;
  const targetOfficeId=officeId||'';
  if(cachedEvents.officeId!==targetOfficeId) return null;
  const list=Array.isArray(cachedEvents.list)?cachedEvents.list:[];
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
const ROW_STATUS_CLASSES=['st-here','st-out','st-meeting','st-remote','st-trip','st-training','st-health','st-coadoc','st-home','st-off'];

function getEventMembersForDate(item, targetDate){
  const today=new Date(targetDate||Date.now());
  const todayStr=`${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
  const start=item.startDate||item.start||item.from||'';
  const end=item.endDate||item.end||item.to||'';
  const bits=item.membersBits||item.bits||'';
  const { memberIds, memberNames } = parseVacationMembersForDate(bits, todayStr, start, end);
  return { memberIds, memberNames, targetDate: todayStr };
}

function applyVacationStatus(tr, statusTd, statusSelect, titles){
  const labelTitle=titles.join(' / ') || 'イベント';
  tr.dataset.event='1';
  tr.dataset.eventTitle=labelTitle;
  if(!statusTd || !statusSelect) return;
  if(statusSelect.dataset.originalValue === undefined){
    statusSelect.dataset.originalValue = statusSelect.value || '';
  }
  statusSelect.style.display='none';
  statusSelect.disabled=true;
  let vacationLabel=statusTd.querySelector('.vacation-status-label');
  if(!vacationLabel){
    vacationLabel=document.createElement('div');
    vacationLabel.className='vacation-status-label';
    statusTd.appendChild(vacationLabel);
  }
  vacationLabel.textContent=labelTitle;
  vacationLabel.style.display='block';
  statusSelect.value='休み';
  ROW_STATUS_CLASSES.forEach(cls=>tr.classList.remove(cls));
  tr.classList.add('st-off');
  tr.dataset.status='休み';
}

function restoreStatusField(tr, statusTd, statusSelect){
  delete tr.dataset.event;
  delete tr.dataset.eventTitle;
  if(!statusTd || !statusSelect) return;
  statusSelect.style.display='';
  statusSelect.disabled=false;
  const vacationLabel=statusTd.querySelector('.vacation-status-label');
  if(vacationLabel){ vacationLabel.style.display='none'; }
  if(statusSelect.dataset.originalValue !== undefined){
    const originalValue=statusSelect.dataset.originalValue;
    statusSelect.value=originalValue;
    delete statusSelect.dataset.originalValue;
    ROW_STATUS_CLASSES.forEach(cls=>tr.classList.remove(cls));
    const statusClassMap=new Map([
      ['在席','st-here'], ['外出','st-out'], ['会議','st-meeting'],
      ['在宅勤務','st-remote'], ['出張','st-trip'], ['研修','st-training'],
      ['健康診断','st-health'], ['コアドック','st-coadoc'], ['帰宅','st-home'], ['休み','st-off']
    ]);
    const cls=statusClassMap.get(originalValue);
    if(cls) tr.classList.add(cls);
    tr.dataset.status=originalValue;
  }
}

function applyEventHighlightForItems(eventItems, targetDate){
  if(!board) {
    console.warn('applyEventHighlight: board element not found');
    return;
  }
  const colorClasses=EVENT_COLOR_KEYS.map(key=>getEventColorClass(key)).filter(Boolean);
  const effectMap=new Map();
  (eventItems||[]).forEach(item=>{
    const { memberIds } = getEventMembersForDate(item, targetDate);
    memberIds.forEach(id=>{
      const key=String(id);
      const ref=effectMap.get(key)||{ vacations:[], highlights:[] };
      if(item.isVacation!==false){ ref.vacations.push(item); }
      ref.highlights.push(item);
      effectMap.set(key, ref);
    });
  });

  board.querySelectorAll('tbody tr').forEach(tr=>{
    const key=String(tr.dataset.key||'');
    const effect=effectMap.get(key);
    const statusTd=tr.querySelector('td.status');
    const statusSelect=statusTd?.querySelector('select[name="status"]');
    tr.classList.remove('event-highlight', ...colorClasses);
    if(effect){
      const colorKey=effect.vacations[0]?.color || effect.highlights[0]?.color || '';
      const colorClass=getEventColorClass(colorKey);
      tr.classList.add('event-highlight');
      if(colorClass){ tr.classList.add(colorClass); }
      if(effect.vacations.length>0){
        applyVacationStatus(tr, statusTd, statusSelect, effect.vacations.map(v=>v.title||'イベント'));
      }else{
        restoreStatusField(tr, statusTd, statusSelect);
      }
    }else{
      restoreStatusField(tr, statusTd, statusSelect);
    }
  });
}

function updateEventLegend(items){
  const target=document.getElementById('eventLegend');
  if(!target) return;
  target.textContent='';
  if(!items || items.length===0){
    const span=document.createElement('span');
    span.className='event-legend-empty';
    span.textContent='選択されたイベントはありません';
    target.appendChild(span);
    return;
  }
  items.forEach(item=>{
    const pill=document.createElement('div');
    pill.className='event-legend-item';
    const dot=document.createElement('span');
    dot.className=`event-color-dot ${getEventColorClass(item.color)}`.trim();
    dot.title=EVENT_COLOR_LABELS[item.color]||'';
    const text=document.createElement('span');
    text.className='event-legend-text';
    text.textContent=item.title||'イベント';
    const type=document.createElement('span');
    type.className='event-legend-type';
    type.textContent=item.isVacation===false?'予定のみ':'休暇固定';
    pill.append(dot, text, type);
    target.appendChild(pill);
  });
}

async function saveEventFromModal(){
  const officeId=(vacationOfficeSelect?.value)||adminSelectedOfficeId||CURRENT_OFFICE_ID||'';
  const selectedId=eventSelectedId || (selectedEventIds?.[0]||'');
  if(!officeId || !selectedId){ toast('表示するイベントを取得できませんでした', false); return false; }
  const item=findCachedEvent(officeId, selectedId);
  if(!item){ toast('イベントの情報を取得できませんでした', false); return false; }
  const ctrl=getEventGanttController();
  const membersBits=ctrl?ctrl.getBitsString():(eventBitsInput?.value||'');
  const payload={
    office: officeId,
    title: item.title||'',
    start: item.startDate||item.start||item.from||'',
    end: item.endDate||item.end||item.to||'',
    note: item.note||item.memo||'',
    membersBits,
    visible: true,
    isVacation: item.isVacation!==false,
    color: item.color||''
  };
  const id=item.id||item.vacationId||selectedId;
  if(id) payload.id=id;
  try{
    const res=await adminSetVacation(officeId,payload);
    if(res && res.ok!==false){
      toast('イベントを保存しました');
      await loadEvents(officeId, false, { visibleOnly:true, onSelect: handleEventSelection });
      await applyEventDisplay(selectedEventIds.length?selectedEventIds:[id]);
      return true;
    }
    throw new Error(res&&res.error?String(res.error):'save_failed');
  }catch(err){
    console.error('saveEventFromModal error', err);
    toast('イベントの保存に失敗しました', false);
    return false;
  }
}

async function applyEventDisplay(selected){
  const officeId=(vacationOfficeSelect?.value)||adminSelectedOfficeId||CURRENT_OFFICE_ID||'';
  const ids=Array.isArray(selected)
    ? selected.map(v=>String(v)).filter(Boolean)
    : (selected? [String(selected)] : []);
  if(ids.length===0 || !officeId){ toast('イベントを選択できませんでした', false); return false; }
  if(cachedEvents.officeId!==officeId){
    await loadEvents(officeId);
  }
  const items=ids.map(id=>findCachedEvent(officeId, id)).filter(Boolean);
  if(items.length===0){ toast('イベントの情報を取得できませんでした', false); return false; }
  applyEventHighlightForItems(items);
  appliedEventIds=ids;
  appliedEventOfficeId=officeId;
  appliedEventTitles=items.map(v=>v.title||'イベント');
  selectedEventIds=ids;
  saveEventIds(officeId, ids);
  updateEventLegend(items);
  return true;
}

async function clearEventDisplay(){
  appliedEventIds=[];
  appliedEventOfficeId='';
  appliedEventTitles=[];
  applyEventHighlightForItems([]);
  updateEventLegend([]);
  saveEventIds(CURRENT_OFFICE_ID, []);
  selectedEventIds=[];
  return true;
}

async function autoApplySavedEvent(){
  const officeId = CURRENT_OFFICE_ID || '';
  if(!officeId) { return; }
  const savedIds = loadSavedEventIds(officeId);
  if(!Array.isArray(savedIds) || savedIds.length===0) { return; }
  let retries = 0;
  const maxRetries = 30;
  while(!board && retries < maxRetries){
    await new Promise(resolve => setTimeout(resolve, 100));
    retries++;
  }
  if(!board) { return; }
  try{
    await applyEventDisplay(savedIds);
  }catch(err){
    console.error('Auto-apply failed:', err);
  }
}

/* レイアウト（JS + CSS両方で冗長に制御） */
const PANEL_MIN_PX=760,GAP_PX=20,MAX_COLS=3;
const CARD_BREAKPOINT_PX=760; // これより狭い幅ではカード表示を強制
