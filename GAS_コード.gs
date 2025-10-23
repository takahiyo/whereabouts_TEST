/** 在席確認表【開発用】 API（Apps Script）CAS対応・拠点別メニュー設定
 *  - 認証：ユーザー / 拠点管理者
 *  - データ：ScriptProperties(JSON) に保存（既存データ互換）
 *  - キャッシュ：CacheService（短期）
 *  - 競合制御：各レコードに rev / serverUpdated を付与（厳格CASはプロパティでON）
 *  - 互換性：既存データに rev/serverUpdated が無くても返却時に補完
 *
 * フロントからの主API：
 *  publicListOffices, login, renew, get, set, getConfig,
 *  listOffices, getFor, getConfigFor, setFor, renameOffice,
 *  setOfficePassword
 */

/* ===== 設定 ===== */
const TOKEN_TTL_MS   = 60 * 60 * 1000;  // 1時間
const CACHE_TTL_SEC  = 20;              // 20秒
const MAX_SET_BYTES  = 120 * 1024;      // set payload サイズ制限
const OFFICE_ID_RE   = /^[0-9A-Za-z_-]+$/;

/* ===== ScriptProperties キー ===== */
const KEY_PREFIX          = 'presence:';
const OFFICES_KEY         = KEY_PREFIX + 'OFFICES_JSON';     // 拠点一覧（id→{name,password,adminPassword}）
const SUPER_ADMIN_OFFICES_KEY = KEY_PREFIX + 'SUPER_ADMIN_OFFICES';

const TOKEN_PREFIX         = 'tok_';
const TOKEN_OFFICE_PREFIX  = 'toff_';
const TOKEN_ROLE_PREFIX    = 'trole_';

/* ===== ユーティリティ ===== */
function now_(){ return Date.now(); }
function json_(obj){ return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }
function p_(e, k, d){ return (e && e.parameter && e.parameter[k] != null) ? String(e.parameter[k]) : d; }

function getSuperAdminOfficeIds_(prop){
  try{
    const raw = (prop || PropertiesService.getScriptProperties()).getProperty(SUPER_ADMIN_OFFICES_KEY);
    if(!raw) return [];
    if(String(raw).trim().length === 0) return [];
    let parsed;
    try{
      parsed = JSON.parse(raw);
      if(Array.isArray(parsed)){
        return parsed.map(v => String(v || '').trim()).filter(Boolean);
      }
    }catch(_){ /* fallthrough */ }
    return String(raw).split(',').map(v => v.trim()).filter(Boolean);
  }catch(_){ return []; }
}

function officeIsSuperAdmin_(office, offs, prop){
  if(!office) return false;
  const propSvc = prop || PropertiesService.getScriptProperties();
  const ids = getSuperAdminOfficeIds_(propSvc);
  if(ids && ids.indexOf(office) >= 0) return true;
  const offices = offs || getOffices_();
  const info = offices && offices[office];
  if(!info) return false;
  const flag = info.superAdmin;
  if(typeof flag === 'string'){ return flag === 'true' || flag === '1'; }
  return Boolean(flag);
}



/* ===== データ保存キー ===== */
function dataKeyForOffice_(office){ return `presence-board-${office}`; }
function configKeyForOffice_(office){ return `presence-config-${office}`; }

/* ===== 拠点一覧（初期値） ===== */
const DEFAULT_OFFICES = {
  admin: { name: 'Administrator', adminPassword: '任意のPW', superAdmin: true },
  dev:  { name: '開発用', password: 'dev',  adminPassword: 'dev'  },
  prod: { name: '稼働用', password: 'prod', adminPassword: 'prod' }
};
function getOffices_(){
  const prop = PropertiesService.getScriptProperties();
  const v = prop.getProperty(OFFICES_KEY);
  if(!v){
    prop.setProperty(OFFICES_KEY, JSON.stringify(DEFAULT_OFFICES));
    return JSON.parse(JSON.stringify(DEFAULT_OFFICES));
  }
  try{ return JSON.parse(v); }catch(e){
    return JSON.parse(JSON.stringify(DEFAULT_OFFICES));
  }
}
function setOffices_(obj){
  PropertiesService.getScriptProperties().setProperty(OFFICES_KEY, JSON.stringify(obj||{}));
}

/* ===== トークン管理 ===== */
function setToken_(prop, token, office, role){
  prop.setProperty(TOKEN_PREFIX + token, String(now_() + TOKEN_TTL_MS));
  prop.setProperty(TOKEN_OFFICE_PREFIX + token, office);
  prop.setProperty(TOKEN_ROLE_PREFIX + token, role);
}
function checkToken_(prop, token){
  const exp = Number(prop.getProperty(TOKEN_PREFIX + token) || 0);
  return (exp && exp >= now_());
}
function renewToken_(prop, token){
  const ok = checkToken_(prop, token);
  if(ok){ prop.setProperty(TOKEN_PREFIX + token, String(now_() + TOKEN_TTL_MS)); }
  return ok;
}
function getOfficeByToken_(prop, token){ return prop.getProperty(TOKEN_OFFICE_PREFIX + token) || ''; }
function getRoleByToken_(prop, token){ return prop.getProperty(TOKEN_ROLE_PREFIX + token) || 'user'; }
function roleIsOfficeAdmin_(prop, token){
  const role = getRoleByToken_(prop, token);
  return role === 'officeAdmin' || role === 'superAdmin';
}
function canAdminOffice_(prop, token, office, opts){
  const role = getRoleByToken_(prop, token);
  if(role === 'superAdmin') return true;
  if(opts && opts.requireSuperAdmin) return false;
  const own = getOfficeByToken_(prop, token);
  return role === 'officeAdmin' && own === office;
}

/* ===== CAS厳格化スイッチ（Script Properties） =====
 * presence:CAS_ENFORCE = "1" で厳格CAS（baseRev古いと conflict）
 * 未設定 or "0" なら緩和（常に受理してサーバでrev++）
 */
function getCasEnforce_(){
  try{
    const v = PropertiesService.getScriptProperties().getProperty('presence:CAS_ENFORCE');
    return String(v) === '1';
  }catch(e){ return false; }
}


/* ===== 既定メニュー／設定 ===== */
function defaultMenus_(){
  return {
    timeStepMinutes: 30,
    statuses: [
      { value: "在席",       class: "st-here",    clearOnSet: true  },
      { value: "外出",       requireTime: true,   class: "st-out"   },
      { value: "在宅勤務",   class: "st-remote",  clearOnSet: true  },
      { value: "出張",       requireTime: true,   class: "st-trip"   },
      { value: "研修",       requireTime: true,   class: "st-training" },
      { value: "健康診断",   requireTime: true,   class: "st-health" },
      { value: "コアドック", requireTime: true,   class: "st-coadoc" },
      { value: "帰宅",       class: "st-home",    clearOnSet: true  },
      { value: "休み",       class: "st-off",     clearOnSet: true  }
      ],
    noteOptions: ["直出","直帰","直出・直帰"]
  };
}
function normalizeNotice_(notice){
  const out = { message: '', links: [] };
  if(notice){
    if(typeof notice === 'string'){
      out.message = String(notice);
    }else if(typeof notice === 'object'){
      if(notice.message != null){
        out.message = String(notice.message);
      }else if(notice.text != null){
        out.message = String(notice.text);
      }
      if(Array.isArray(notice.links)){
        out.links = notice.links.map(link => {
          if(!link) return null;
          if(typeof link === 'string'){
            const url = String(link).trim();
            if(!url) return null;
            return { url, label: url };
          }
          const url = String(link.url || '').trim();
          if(!url) return null;
          const labelRaw = link.label != null ? String(link.label) : '';
          const label = labelRaw.trim() || url;
          return { url, label };
        }).filter(Boolean);
      }
    }
  }
  out.message = out.message.replace(/\r\n?/g, '\n');
  return out;
}
function defaultConfig_(){
  return { version: 3, updated: 0, groups: [], menus: defaultMenus_(), notice: normalizeNotice_({}) };
}
function normalizeConfig_(cfg){
  if(!cfg || typeof cfg !== 'object') return defaultConfig_();
  const groups = Array.isArray(cfg.groups) ? cfg.groups : [];
  const version = Number(cfg.version || 0);
  const out = {
    version: version >= 3 ? version : 3,
    updated: Number(cfg.updated || 0),
    groups: groups.map(g=>{
      const members = Array.isArray(g.members) ? g.members : [];
      return {
        title: String(g.title || ''),
        members: members.map(m=>({
          id:   String(m.id || '').trim(),
          name: String(m.name || ''),
          ext:  String(m.ext || '')
        })).filter(m=>m.id || m.name)
      };
    }),
    menus: (cfg.menus && typeof cfg.menus === 'object') ? cfg.menus : defaultMenus_(),
    notice: normalizeNotice_(cfg.notice != null ? cfg.notice : cfg.noticeText)
  };
  return out;
}

function notifyConfigPush_(office){
  CacheService.getScriptCache().put(KEY_PREFIX + 'cfgpush:' + office, String(now_()), CACHE_TTL_SEC);
}


function adminSetConfigFor(office, cfg){
  const prop = PropertiesService.getScriptProperties();
  const parsed = normalizeConfig_(cfg);
  parsed.updated = now_();
  const CONFIG_KEY = configKeyForOffice_(office);
  const out = JSON.stringify(parsed);
  prop.setProperty(CONFIG_KEY, out);
  CacheService.getScriptCache().put(KEY_PREFIX+'cfg:'+office, out, CACHE_TTL_SEC);
  notifyConfigPush_(office);
  return parsed;
}

function syncStatuses(){
  const prop = PropertiesService.getScriptProperties();
  const defStatuses = defaultMenus_().statuses;
  const defJson = JSON.stringify(defStatuses);
  (prop.getKeys() || []).filter(k=>k.indexOf('presence-config-')===0).forEach(k=>{
    let cfg; try{ cfg = JSON.parse(prop.getProperty(k) || '') || {}; }catch(_){ cfg = {}; }
    const curJson = JSON.stringify((cfg.menus && cfg.menus.statuses) || []);
    if(curJson !== defJson){
      cfg.menus = cfg.menus || {};
      cfg.menus.statuses = defStatuses;
      const office = k.replace('presence-config-','');
      adminSetConfigFor(office, cfg);
    }
  });
}

/* ===== メイン ===== */
function doPost(e){
  const action = p_(e, 'action', '');
  const prop   = PropertiesService.getScriptProperties();
  const cache  = CacheService.getScriptCache();
  syncStatuses();

  /* --- 無認証API --- */
  if(action === 'publicListOffices'){
    const offs = getOffices_();
    const offices = Object.keys(offs).map(id => ({ id, name: offs[id].name }));
    return json_({ offices });
  }
  if(action === 'login'){
    const office = p_(e,'office','');
    const offs = getOffices_();
    if(!office || !offs[office]) return json_({ error:'unauthorized' });
    const pw = p_(e,'password','');
    if(!pw) return json_({ error:'unauthorized' });
    let role = '';
    if(pw === String(offs[office].adminPassword || '')){
      role = officeIsSuperAdmin_(office, offs, prop) ? 'superAdmin' : 'officeAdmin';
    }else if(pw === String(offs[office].password || '')) role = 'user';
    else return json_({ error:'unauthorized' });
    const token = Utilities.getUuid().replace(/-/g,'');
    setToken_(prop, token, office, role);
    return json_({ token, role, office, officeName:offs[office].name, exp: TOKEN_TTL_MS });
  }
  if(action === 'renew'){
    const token = p_(e,'token','');
    if(!renewToken_(prop, token)) return json_({ error:'unauthorized' });
    const offs = getOffices_();
    const office = getOfficeByToken_(prop, token);
    const officeName = office && offs[office] ? offs[office].name : '';
    return json_({ ok:true, role:getRoleByToken_(prop, token), office, officeName, exp:TOKEN_TTL_MS });
  }

  /* --- ここから認証必須 --- */
  const token = p_(e,'token','');
  if(!checkToken_(prop, token)) return json_({ error:'unauthorized' });
  const tokenOffice = getOfficeByToken_(prop, token);
  if(!tokenOffice) return json_({ error:'unauthorized' });

  /* ===== ユーザAPI ===== */
  if(action === 'get'){
    const office = tokenOffice;
    const DATA_KEY = dataKeyForOffice_(office);
    const noCache  = p_(e,'nocache','') === '1';
    const cKey     = KEY_PREFIX + 'data:' + office;

    const hit = noCache ? null : cache.get(cKey);
    if(hit){ try{ return json_(JSON.parse(hit)); }catch(_){ /* fallthrough */ } }

    let obj;
    try{ obj = JSON.parse(prop.getProperty(DATA_KEY) || '') || { updated:0, data:{} }; }
    catch(_){ obj = { updated:0, data:{} }; }

    // 互換補完：各レコードに rev / serverUpdated を付与（なければ）
    const nowTs = now_();
    if(obj && obj.data && typeof obj.data === 'object'){
      Object.keys(obj.data).forEach(id=>{
        const r = obj.data[id] || {};
        if(typeof r.rev !== 'number') r.rev = 1;
        if(typeof r.serverUpdated !== 'number') r.serverUpdated = nowTs;
        obj.data[id] = r;
      });
    }

    const out = JSON.stringify(obj);
    if(!noCache) cache.put(cKey, out, CACHE_TTL_SEC);
    return json_(obj);
  }

  if(action === 'set'){
    const office = tokenOffice;
    const DATA_KEY = dataKeyForOffice_(office);

    const raw = p_(e,'data','{"updated":0,"data":{}}');
    if(raw && raw.length > MAX_SET_BYTES) return json_({ error:'too_large' });

    let incoming;
    try{
      incoming = JSON.parse(raw);
      if(!incoming || typeof incoming !== 'object' || typeof incoming.data !== 'object'){
        return json_({ error:'bad_data' });
      }
    }catch(_){ return json_({ error:'bad_json' }); }

    let baseRev = {};
    try{ baseRev = JSON.parse(p_(e,'baseRev','{}')) || {}; }catch(_){ baseRev = {}; }

    const enforce = getCasEnforce_();

    const lock = LockService.getScriptLock(); lock.waitLock(2000);
    try{
      let cur;
      try{ cur = JSON.parse(prop.getProperty(DATA_KEY) || '') || { updated:0, data:{} }; }
      catch(_){ cur = { updated:0, data:{} }; }

      const outData = Object.assign({}, cur.data || {});
      const nowTs = now_();
      const conflicts = [];
      const revMap = {};
      const tsMap  = {};

      Object.keys(incoming.data).forEach(id=>{
        const client = incoming.data[id] || {};
        const prev   = outData[id] || {};
        const prevRev = (typeof prev.rev === 'number') ? prev.rev : 0;
        const clientBase = Number(baseRev[id] || 0);

        if(enforce && clientBase < prevRev){
          conflicts.push({ id, server: prev });
          return;
        }
        const nextRev = prevRev + 1; // 緩和/厳格いずれでもサーバ採番
        const rec = {
          ext:   client.ext   == null ? '' : String(client.ext),
          status:client.status== null ? '' : String(client.status),
          time:  client.time  == null ? '' : String(client.time),
          note:  client.note  == null ? '' : String(client.note),
          rev: nextRev,
          serverUpdated: nowTs
        };
        outData[id] = rec;
        revMap[id] = nextRev;
        tsMap[id]  = nowTs;
      });

      if(enforce && conflicts.length){
        return json_({ error:'conflict', conflicts, rev:revMap, serverUpdated:tsMap });
      }

      const out = { updated: nowTs, data: outData };
      prop.setProperty(DATA_KEY, JSON.stringify(out));
      CacheService.getScriptCache().put(KEY_PREFIX+'data:'+office, JSON.stringify(out), CACHE_TTL_SEC);
      return json_({ ok:true, rev:revMap, serverUpdated:tsMap, conflicts: conflicts.length ? conflicts : undefined });
    } finally {
      try{ lock.releaseLock(); }catch(_){}
    }
  }

  if(action === 'getConfig'){
    const office = tokenOffice;
    const CONFIG_KEY = configKeyForOffice_(office);
    const noCache = p_(e,'nocache','') === '1';
    const cKey = KEY_PREFIX + 'cfg:' + office;

    const hit = noCache ? null : cache.get(cKey);
    if(hit){ try{ return json_(JSON.parse(hit)); }catch(_){ /* fallthrough */ } }

    let cfg;
    try{ cfg = JSON.parse(prop.getProperty(CONFIG_KEY) || '') || defaultConfig_(); }
    catch(_){ cfg = defaultConfig_(); }
    const parsed = normalizeConfig_(cfg);
    if(!parsed.updated) parsed.updated = now_();

    const out = JSON.stringify(parsed);
    if(!noCache) cache.put(cKey, out, CACHE_TTL_SEC);
    return json_(parsed);
  }

  /* ===== 管理API ===== */
  if(action === 'listOffices'){
    const offs = getOffices_();
    const role = getRoleByToken_(prop, token);
    if(role === 'superAdmin'){
      const offices = Object.keys(offs).map(id => ({ id, name: offs[id].name }));
      return json_({ offices });
    }
    const id = tokenOffice;
    return json_({ offices: [{ id, name: offs[id].name }] });
  }

  if(action === 'getFor'){
    const office = p_(e,'office', tokenOffice);
    if(!canAdminOffice_(prop, token, office)) return json_({ error:'forbidden' });
    const DATA_KEY = dataKeyForOffice_(office);
    let obj;
    try{ obj = JSON.parse(prop.getProperty(DATA_KEY) || '') || { updated:0, data:{} }; }
    catch(_){ obj = { updated:0, data:{} }; }
    return json_(obj);
  }

  if(action === 'getConfigFor'){
    const office = p_(e,'office', tokenOffice);
    if(!canAdminOffice_(prop, token, office)) return json_({ error:'forbidden' });
    const CONFIG_KEY = configKeyForOffice_(office);
    let cfg;
    try{ cfg = JSON.parse(prop.getProperty(CONFIG_KEY) || '') || defaultConfig_(); }
    catch(_){ cfg = defaultConfig_(); }
    return json_(normalizeConfig_(cfg));
  }

  if(action === 'setConfigFor'){
    const office = p_(e,'office', tokenOffice);
    if(!canAdminOffice_(prop, token, office)) return json_({ error:'forbidden' });
    let cfg;
    try{ cfg = JSON.parse(p_(e,'data','{}')); }catch(_){ return json_({ error:'bad_json' }); }
    const parsed = adminSetConfigFor(office, cfg);
    return json_(parsed);
  }

  if(action === 'setFor'){
    const office = p_(e,'office', tokenOffice);
    if(!canAdminOffice_(prop, token, office)) return json_({ error:'forbidden' });

    let incoming;
    try{ incoming = JSON.parse(p_(e,'data','{}')) || {}; }catch(_){ return json_({ error:'bad_json' }); }
    const full = !!incoming.full;

    const lock = LockService.getScriptLock(); lock.waitLock(2000);
    try{
      const DATA_KEY = dataKeyForOffice_(office);
      let cur; try{ cur = JSON.parse(prop.getProperty(DATA_KEY) || '') || { updated:0, data:{} }; }
      catch(_){ cur = { updated:0, data:{} }; }

      const base = full ? {} : (cur.data || {});
      const outData = Object.assign({}, base);
      const nowTs = now_();

      Object.keys(incoming.data || {}).forEach(id=>{
        const v = incoming.data[id] || {};
        const prev = cur.data && cur.data[id] || {};
        const nextRev = (typeof prev.rev === 'number' ? prev.rev : 0) + 1;
        outData[id] = {
          ext:   v.ext   == null ? '' : String(v.ext),
          status:v.status== null ? '' : String(v.status),
          time:  v.time  == null ? '' : String(v.time),
          note:  v.note  == null ? '' : String(v.note),
          rev: nextRev,
          serverUpdated: nowTs
        };
      });

      const out = { updated: nowTs, data: outData };
      prop.setProperty(DATA_KEY, JSON.stringify(out));
      CacheService.getScriptCache().put(KEY_PREFIX+'data:'+office, JSON.stringify(out), CACHE_TTL_SEC);
      return json_({ ok:true });
    } finally{
      try{ lock.releaseLock(); }catch(_){}
    }
  }

  if(action === 'createOffice'){
    if(getRoleByToken_(prop, token) !== 'superAdmin') return json_({ error:'forbidden' });
    const rawId = p_(e,'id','');
    const id = normalizeOfficeId_(rawId);
    const name = p_(e,'name','').trim();
    const password = p_(e,'password','');
    const adminPassword = p_(e,'adminPassword','');
    if(!id || !name || !password || !adminPassword) return json_({ error:'bad_request' });
    if(!OFFICE_ID_RE.test(id)) return json_({ error:'bad_request' });
    const offs = getOffices_();
    const conflictKey = Object.keys(offs || {}).find(k => normalizeOfficeId_(k) === id);
    if(conflictKey) return json_({ error:'duplicate' });
    offs[id] = { name, password: String(password), adminPassword: String(adminPassword) };
    setOffices_(offs);
    try{ cache.removeAll([
      KEY_PREFIX + 'data:' + id,
      KEY_PREFIX + 'cfg:' + id,
      KEY_PREFIX + 'cfgpush:' + id,
      KEY_PREFIX + 'offices',
      KEY_PREFIX + 'publicOffices'
    ]); }catch(_){ }
    return json_({ ok:true });
  }

  if(action === 'deleteOffice'){
    if(getRoleByToken_(prop, token) !== 'superAdmin') return json_({ error:'forbidden' });
    const rawId = p_(e,'id','');
    const id = normalizeOfficeId_(rawId);
    if(!id) return json_({ error:'bad_request' });
    const offs = getOffices_();
    const actualId = Object.keys(offs || {}).find(k => normalizeOfficeId_(k) === id);
    if(!actualId) return json_({ error:'not_found' });
    delete offs[actualId];
    setOffices_(offs);

    const dataKey = dataKeyForOffice_(actualId);
    const configKey = configKeyForOffice_(actualId);
    try{ prop.deleteProperty(dataKey); }catch(_){ }
    try{ prop.deleteProperty(configKey); }catch(_){ }
    try{ cache.removeAll([
      KEY_PREFIX + 'data:' + actualId,
      KEY_PREFIX + 'cfg:' + actualId,
      KEY_PREFIX + 'cfgpush:' + actualId,
      KEY_PREFIX + 'offices',
      KEY_PREFIX + 'publicOffices'
    ]); }catch(_){ }

    const superIds = getSuperAdminOfficeIds_(prop);
    if(Array.isArray(superIds)){
      const filtered = superIds.filter(v => v && normalizeOfficeId_(v) !== id);
      if(filtered.length !== superIds.length){
        if(filtered.length){
          prop.setProperty(SUPER_ADMIN_OFFICES_KEY, JSON.stringify(filtered));
        }else{
          try{ prop.deleteProperty(SUPER_ADMIN_OFFICES_KEY); }catch(_){ }
        }
      }
    }

    return json_({ ok:true });
  }

  if(action === 'renameOffice'){
    const office = p_(e,'office', tokenOffice);
    if(!canAdminOffice_(prop, token, office)) return json_({ error:'forbidden' });
    const name = p_(e,'name','').trim();
    if(!name) return json_({ error:'bad_request' });
    const offs = getOffices_();
    offs[office].name = name;
    setOffices_(offs);
    return json_({ ok:true });
  }


  if(action === 'setOfficePassword'){
    const id = p_(e,'id', tokenOffice).trim();
    if(!canAdminOffice_(prop, token, id)) return json_({ error:'forbidden' });
    const pw  = p_(e,'password','');
    const apw = p_(e,'adminPassword','');
    if(!pw && !apw) return json_({ error:'bad_request' });
    const offs = getOffices_();
    if(!offs[id]) return json_({ error:'not_found' });
    if(pw)  offs[id].password = pw;
    if(apw) offs[id].adminPassword = apw;
    setOffices_(offs);
    return json_({ ok:true });
  }

  return json_({ error:'unknown_action' });
}

function doGet(e){
  const action = p_(e,'action','');
  if(action === 'watchConfig'){
    const token = p_(e,'token','');
    const since = Number(p_(e,'since','0'));
    const prop = PropertiesService.getScriptProperties();
    if(!checkToken_(prop, token)) return ContentService.createTextOutput('unauthorized');
    const office = getOfficeByToken_(prop, token);
    const cache = CacheService.getScriptCache();
    const key = KEY_PREFIX + 'cfgpush:' + office;
    let ts = Number(cache.get(key) || 0);
    const limit = now_() + 25000;
    while(ts <= since && now_() < limit){
      Utilities.sleep(1000);
      ts = Number(cache.get(key) || 0);
    }
    const CONFIG_KEY = configKeyForOffice_(office);
    let cfg;
    try{ cfg = JSON.parse(prop.getProperty(CONFIG_KEY) || '') || defaultConfig_(); }
    catch(_){ cfg = defaultConfig_(); }
    const parsed = normalizeConfig_(cfg);
    const out = `id: ${ts}\ndata: ${JSON.stringify(parsed)}\n\n`;
    return ContentService.createTextOutput(out).setMimeType('text/event-stream');
  }
  return ContentService.createTextOutput('unsupported');
}


