/* ツールモーダル */
let CURRENT_TOOLS = [];

function normalizeTools(raw){
  if(raw == null) return [];
  const arr = Array.isArray(raw) ? raw : [raw];
  return arr
    .map((item, idx)=>{
      if(item == null) return null;
      if(typeof item === 'string'){
        const text=item.trim();
        if(!text) return null;
        return { title: text, url: '', note: '' };
      }
      if(typeof item === 'object'){
        const titleSource = item.title ?? item.name ?? item.label ?? '';
        const urlSource = item.url ?? item.link ?? '';
        const noteSource = item.note ?? item.memo ?? item.remark ?? '';
        const titleStr = String(titleSource || '').trim();
        const urlStr = String(urlSource || '').trim();
        const noteStr = String(noteSource || '').trim();
        if(!titleStr && !urlStr && !noteStr) return null;
        return {
          title: titleStr || urlStr || `ツール${idx+1}`,
          url: urlStr,
          note: noteStr,
        };
      }
      return null;
    })
    .filter(Boolean);
}

function renderToolsList(list){
  if(!toolsList) return;
  toolsList.textContent='';
  const tools = Array.isArray(list) ? list : [];
  if(tools.length === 0){
    const empty=document.createElement('div');
    empty.className='tools-empty';
    empty.textContent='ツール情報がまだありません。後で再読み込みしてください。';
    toolsList.appendChild(empty);
    return;
  }
  tools.forEach(tool => {
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

window.applyToolsData = applyToolsData;
window.renderToolsList = renderToolsList;
