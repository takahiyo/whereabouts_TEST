/* ===== メニュー・正規化・通信・同期 ===== */
function defaultMenus(){
  return {
    timeStepMinutes: 30,
    statuses: [
      { value: "在席",         class: "st-here",    clearOnSet: true  },
      { value: "外出",         requireTime: true,   class: "st-out"   },
      { value: "会議",         requireTime: true,   class: "st-meeting" },
      { value: "テレワーク",   class: "st-remote",  clearOnSet: true  },
      { value: "休み",         class: "st-off",     clearOnSet: true  }
    ],
    noteOptions: ["直出","直帰","直出・直帰"]
  };
}
function setupMenus(m){
  MENUS = m || defaultMenus();
  const sts = Array.isArray(MENUS.statuses) ? MENUS.statuses : defaultMenus().statuses;

  STATUSES = sts.map(s => ({ value: String(s.value) }));
  requiresTimeSet = new Set(sts.filter(s => s.requireTime).map(s => String(s.value)));
  clearOnSet       = new Set(sts.filter(s => s.clearOnSet).map(s => String(s.value)));
  statusClassMap   = new Map(sts.map(s => [String(s.value), String(s.class || "")]));

  // 備考候補 datalist（先頭は空白のラベル付き）
  let dl = document.getElementById('noteOptions');
  if(!dl){ dl = document.createElement('datalist'); dl.id = 'noteOptions'; document.body.appendChild(dl); }
  dl.replaceChildren();
  const optBlank = document.createElement('option'); optBlank.value = ""; optBlank.label = "（空白）"; optBlank.textContent = "（空白）"; dl.appendChild(optBlank);
  (MENUS.noteOptions || []).forEach(t => { const opt = document.createElement('option'); opt.value = String(t); dl.appendChild(opt); });

  buildStatusFilterOptions();
}
function isNotePresetValue(val){
  const v=(val==null?"":String(val)).trim();
  if(v==="") return true;
  const set = new Set((MENUS?.noteOptions||[]).map(x=>String(x)));
  return set.has(v);
}
function fallbackGroupTitle(g, idx){
  const t = (g && g.title != null) ? String(g.title).trim() : "";
  return t || `グループ${idx + 1}`;
}
function normalizeConfigClient(cfg){
  const groups = (cfg && Array.isArray(cfg.groups)) ? cfg.groups : [];
  return groups.map(g => {
    const members = Array.isArray(g.members) ? g.members : [];
    return {
      title: g.title || "",
      members: members.map(m => ({
        id:    String(m.id ?? "").trim(),
        name:  String(m.name ?? ""),
        ext:   String(m.ext  ?? "")
      })).filter(m => m.id || m.name)
    };
  });
}
async function fastFetchDataOnce(){
  return await apiPost({ action: 'get', token: SESSION_TOKEN, nocache: '1' });
}
function startRemoteSync(immediate){
  if(remotePullTimer){ clearInterval(remotePullTimer); remotePullTimer = null; }
  if(immediate){
    fastFetchDataOnce().then(async r => {
      if(r?.error==='unauthorized'){
        if(remotePullTimer){ clearInterval(remotePullTimer); remotePullTimer=null; }
        await logout();
        return;
      }
      if(r && r.data) applyState(r.data);
    }).catch(()=>{});
  }
  remotePullTimer = setInterval(async ()=>{
    const r = await apiPost({ action:'get', token: SESSION_TOKEN });
            if(r?.error==='unauthorized'){
      if(remotePullTimer){ clearInterval(remotePullTimer); remotePullTimer=null; }
      await logout();
      return;
    }
    if(r && r.data) applyState(r.data);
  }, REMOTE_POLL_MS);
}
function startConfigWatch(){
  if(configWatchTimer){ clearInterval(configWatchTimer); configWatchTimer = null; }
  configWatchTimer = setInterval(async ()=>{
    const cfg = await apiPost({ action:'getConfig', token: SESSION_TOKEN, nocache:'1' });
            if(cfg?.error==='unauthorized'){
      if(configWatchTimer){ clearInterval(configWatchTimer); configWatchTimer=null; }
      await logout();
      return;
    }
    if(cfg && !cfg.error){
      const updated = (typeof cfg.updated === 'number') ? cfg.updated : 0;
      if(updated && updated !== CONFIG_UPDATED){
        GROUPS = normalizeConfigClient(cfg);
        CONFIG_UPDATED = updated;
        setupMenus(cfg.menus || null);
        render();
      }
    }
  }, CONFIG_POLL_MS);
}
function scheduleRenew(ttlMs){
  if(tokenRenewTimer) { clearTimeout(tokenRenewTimer); tokenRenewTimer = null; }
  const delay = Math.max(10_000, Number(ttlMs||TOKEN_DEFAULT_TTL) - 60_000);
  tokenRenewTimer = setTimeout(async ()=>{
    const me = await apiPost({ action: 'renew', token: SESSION_TOKEN });
    if(me && me.ok){
                  const prevRole = CURRENT_ROLE;
      CURRENT_ROLE = me.role || CURRENT_ROLE;
      saveSessionMeta();
            if(CURRENT_ROLE !== prevRole){
        ensureAuthUI();
        applyRoleToManual();
      }
      scheduleRenew(Number(me.exp) || TOKEN_DEFAULT_TTL);
    }
  }, delay);
}

/* 送信（CAS: baseRev 同梱） */
async function pushRowDelta(key){
  const tr = document.getElementById(`row-${key}`);
  try{
    if(!tr) return;
    const st = getRowState(key);
    const baseRev = {}; baseRev[key] = Number(tr.dataset.rev || 0);
    const payload = { updated: Date.now(), data: { [key]: st } };
    const r = await apiPost({ action:'set', token: SESSION_TOKEN, data: JSON.stringify(payload), baseRev: JSON.stringify(baseRev) });

    if(!r){ toast('通信エラー', false); return; }

    if(r.error === 'conflict'){
      // サーバ側の値で上書き
      const c = (r.conflicts && r.conflicts.find(x=>x.id===key)) || null;
      if(c && c.server){
        applyState({ [key]: c.server });
        toast('他端末と競合しました（サーバ値で更新）', false);
      }else{
        // 競合配列が無い場合でも rev マップがあれば反映
        const rev = Number((r.rev && r.rev[key]) || 0);
        const ts  = Number((r.serverUpdated && r.serverUpdated[key]) || 0);
        if(rev){ tr.dataset.rev = String(rev); tr.dataset.serverUpdated = String(ts||0); }
        saveLocal();
      }
      return;
    }

    if(!r.error){
      const rev = Number((r.rev && r.rev[key]) || 0);
      const ts  = Number((r.serverUpdated && r.serverUpdated[key]) || 0);
      if(rev) { tr.dataset.rev = String(rev); tr.dataset.serverUpdated = String(ts||0); }
      saveLocal();
      return;
    }

    toast('保存に失敗しました', false);
  }finally{
    PENDING_ROWS.delete(key);
    if(tr){ const n=tr.querySelector('input[name="note"]'); if(n) delete n.dataset.editing; }
  }

}
