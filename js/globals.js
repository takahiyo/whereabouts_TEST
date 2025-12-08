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

/* 長期休暇の読み込みと表示 */
async function loadLongVacations(office, showToast = false){
  if(!office) office = CURRENT_OFFICE_ID;
  if(!office){
    console.warn('loadLongVacations: office is not specified');
    return;
  }

  try{
    const res = await apiPost({ action:'getVacation', token:SESSION_TOKEN, office, nocache:'1' });
    if(res && res.error){
      console.error('loadLongVacations error:', res.error);
      if(showToast) toast('長期休暇の取得に失敗しました', false);
      return;
    }

    const vacations = Array.isArray(res?.vacations) ? res.vacations : [];
    renderLongVacationList(vacations);
    if(showToast && vacations.length > 0) toast(`長期休暇を${vacations.length}件読み込みました`);
  }catch(err){
    console.error('loadLongVacations exception:', err);
    if(showToast) toast('長期休暇の取得に失敗しました', false);
  }
}

function renderLongVacationList(vacations){
  if(!longVacationListBody) return;
  longVacationListBody.textContent = '';

  if(!Array.isArray(vacations) || vacations.length === 0){
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 4;
    td.style.textAlign = 'center';
    td.style.color = '#6b7280';
    td.textContent = '長期休暇はありません';
    tr.appendChild(td);
    longVacationListBody.appendChild(tr);
    return;
  }

  vacations.forEach(vacation => {
    const tr = document.createElement('tr');

    // タイトル
    const titleTd = document.createElement('td');
    titleTd.textContent = vacation.title || '';
    tr.appendChild(titleTd);

    // 期間
    const periodTd = document.createElement('td');
    const start = vacation.startDate || vacation.start || '';
    const end = vacation.endDate || vacation.end || '';
    periodTd.textContent = (start || end) ? `${start || ''}〜${end || ''}` : '-';
    tr.appendChild(periodTd);

    // 対象メンバー
    const membersTd = document.createElement('td');
    const bits = vacation.membersBits || '';
    if(bits){
      const memberNames = parseMemberNamesFromBits(bits);
      membersTd.textContent = memberNames.length > 0 ? memberNames.join(', ') : '-';
    }else{
      membersTd.textContent = '-';
    }
    tr.appendChild(membersTd);

    // 備考
    const noteTd = document.createElement('td');
    noteTd.textContent = vacation.note || vacation.memo || '';
    tr.appendChild(noteTd);

    longVacationListBody.appendChild(tr);
  });
}

function parseMemberNamesFromBits(bitsString){
  if(!bitsString) return [];
  const members = [];
  const parts = bitsString.split(';').filter(Boolean);

  parts.forEach(part => {
    const [date, bits] = part.includes(':') ? part.split(':') : ['', part];
    if(!bits) return;

    // 最初の日付だけ処理（全日程同じメンバーと仮定）
    if(members.length === 0){
      const orderedMembers = getRosterOrdering().flatMap(g => 
        (g.members || []).map(m => m.name)
      );
      
      for(let i = 0; i < bits.length && i < orderedMembers.length; i++){
        if(bits[i] === '1'){
          members.push(orderedMembers[i]);
        }
      }
    }
  });

  return members;
}

function getRosterOrdering(){
  if(!Array.isArray(GROUPS)) return [];
  return GROUPS.map(g => ({
    title: g.title || '',
    members: Array.isArray(g.members) ? g.members : []
  }));
}

/* レイアウト（JS + CSS両方で冗長に制御） */
const PANEL_MIN_PX=760,GAP_PX=20,MAX_COLS=3;
const CARD_BREAKPOINT_PX=760; // これより狭い幅ではカード表示を強制
