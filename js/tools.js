/* ツールモーダル */
let CURRENT_TOOLS = [];

function coerceToolVisibleFlag(raw){
  if (raw === true || raw == null) return true;
  if (raw === false) return false;
  const s = String(raw).trim().toLowerCase();
  return !(s === 'false' || s === '0' || s === 'off' || s === 'no' || s === 'hide');
}

function normalizeTools(raw){
  if(raw == null) return [];
  const arr = Array.isArray(raw) ? raw : [raw];
  return arr
    .map((item, idx)=>{
      if(item == null) return null;
      if(typeof item === 'string'){
        const text=item.trim();
        if(!text) return null;
        return { title: text, url: '', note: '', visible:true, display:true, children:[] };
      }
      if(typeof item === 'object'){
        const titleSource = item.title ?? item.name ?? item.label ?? '';
        const urlSource = item.url ?? item.link ?? '';
        const noteSource = item.note ?? item.memo ?? item.remark ?? '';
        const childrenSource = item.children ?? item.items ?? [];
        const titleStr = String(titleSource || '').trim();
        const urlStr = String(urlSource || '').trim();
        const noteStr = String(noteSource || '').trim();
        const visible = coerceToolVisibleFlag(item.visible ?? item.display ?? item.show ?? true);
        const children = normalizeTools(childrenSource);
        if(!titleStr && !urlStr && !noteStr && children.length===0) return null;
        return {
          id: item.id ?? item.toolId ?? item.key,
          title: titleStr || urlStr || `ツール${idx+1}`,
          url: urlStr,
          note: noteStr,
          visible,
          display: visible,
          children
        };
      }
      return null;
    })
    .filter(Boolean);
}

function renderToolsList(list){
  if(!toolsList) return;
  toolsList.textContent='';
  const tools = normalizeTools(list);
  const visibleTools = tools.filter(t=> coerceToolVisibleFlag(t.visible ?? t.display ?? t.show ?? true));
  if(visibleTools.length === 0){
    const empty=document.createElement('div');
    empty.className='tools-empty';
    empty.textContent='ツール情報がまだありません。後で再読み込みしてください。';
    toolsList.appendChild(empty);
    return;
  }
  visibleTools.forEach(tool => {
    const item=document.createElement('div');
    item.className='tools-item';

    const titleRow=document.createElement('div');
    titleRow.className='tools-item-title';
    const hasUrl=!!tool.url;
    const titleEl=document.createElement(hasUrl?'a':'span');
    titleEl.textContent=tool.title || (hasUrl ? tool.url : 'ツール');
    if(hasUrl){
      titleEl.href=tool.url;
      titleEl.target='_blank';
      titleEl.rel='noopener noreferrer';
    }
    titleRow.appendChild(titleEl);
    item.appendChild(titleRow);

    if(hasUrl){
      const linkRow=document.createElement('div');
      linkRow.className='tools-item-link';
      const link=document.createElement('a');
      link.href=tool.url;
      link.target='_blank';
      link.rel='noopener noreferrer';
      link.textContent=tool.url;
      linkRow.appendChild(link);
      item.appendChild(linkRow);
    }

    const noteRow=document.createElement('div');
    noteRow.className='tools-item-note';
    noteRow.textContent=tool.note || '備考：記載なし';
    item.appendChild(noteRow);

    toolsList.appendChild(item);
  });
}

function applyToolsData(raw){
  CURRENT_TOOLS = normalizeTools(raw);
  renderToolsList(CURRENT_TOOLS);
}

async function fetchTools(officeId){
  if(!SESSION_TOKEN){ return []; }
  try{
    const params={ action:'getTools', token:SESSION_TOKEN, nocache:'1' };
    const targetOffice=officeId || CURRENT_OFFICE_ID || '';
    if(targetOffice) params.office=targetOffice;
    const res=await apiPost(params);
    if(res && res.tools){
      const normalized=normalizeTools(res.tools);
      applyToolsData(normalized);
      return normalized;
    }
    if(res && res.error==='unauthorized'){
      toast('セッションの有効期限が切れました。再度ログインしてください', false);
      await logout();
      return [];
    }
    if(res && res.error){
      console.error('fetchTools error:', res.error, res.debug||'');
    }
  }catch(err){
    console.error('ツール取得エラー:', err);
  }
  return [];
}

async function saveTools(tools, officeId){
  if(!SESSION_TOKEN){ return false; }
  try{
    const payload=normalizeTools(tools);
    const params={ action:'setTools', token:SESSION_TOKEN, tools:JSON.stringify(payload) };
    const targetOffice=officeId || CURRENT_OFFICE_ID || '';
    if(targetOffice) params.office=targetOffice;
    const res=await apiPost(params);
    if(res && res.ok){
      const nextTools=Object.prototype.hasOwnProperty.call(res,'tools') ? normalizeTools(res.tools) : payload;
      applyToolsData(nextTools);
      return true;
    }
    if(res && res.error==='forbidden'){
      toast('ツールの編集権限がありません');
      return false;
    }
    if(res && res.error==='unauthorized'){
      toast('セッションの有効期限が切れました。再度ログインしてください', false);
      await logout();
      return false;
    }
    if(res && res.error){
      const debugInfo=res.debug?` (${res.debug})`:'';
      toast('エラー: ' + res.error + debugInfo);
      console.error('setTools error details:', res);
      return false;
    }
    console.error('Unexpected setTools response:', res);
    toast('ツールの保存に失敗しました（不明なレスポンス）');
  }catch(err){
    console.error('ツール保存エラー:', err);
    toast('通信エラーが発生しました: ' + err.message);
  }
  return false;
}

window.applyToolsData = applyToolsData;
window.renderToolsList = renderToolsList;
window.fetchTools = fetchTools;
window.saveTools = saveTools;
window.normalizeTools = normalizeTools;
window.coerceToolVisibleFlag = coerceToolVisibleFlag;
