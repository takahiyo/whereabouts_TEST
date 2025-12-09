(function(){
  const HOLIDAY_API_URL = window.HOLIDAY_API_URL || 'https://holidays-jp.github.io/api/v1/date.json';
  const MANUAL_HOLIDAYS = Array.isArray(window.MANUAL_HOLIDAYS) ? window.MANUAL_HOLIDAYS : [];
  const holidayCache = new Map(); // year -> Set<string>

  const FALLBACK_DAYS = 7;

  function normalizeDateStr(str){
    if(!str) return '';
    const d = new Date(str);
    if(Number.isNaN(d.getTime())) return '';
    const y = d.getFullYear();
    const m = `${d.getMonth()+1}`.padStart(2,'0');
    const day = `${d.getDate()}`.padStart(2,'0');
    return `${y}-${m}-${day}`;
  }

  function createVacationGanttController(config){
    const opts = config || {};
    const startInput = opts.startInput || null;
    const endInput = opts.endInput || null;
    const bitsInput = opts.bitsInput || null;
    let ganttRoot = opts.rootEl || null;
    let tableEl = null;
    let orderedMembers = [];
    let dateSlots = [];
    let bitsByDate = new Map(); // date -> Array<boolean>
    let draggingState = null;
    let initialized = false;

    function getDateRange(){
      const startRaw = startInput?.value || '';
      const endRaw   = endInput?.value   || '';
      const start = normalizeDateStr(startRaw) || normalizeDateStr(new Date());
      let end = normalizeDateStr(endRaw);
      if(!end){
        const base = start ? new Date(start) : new Date();
        const tmp = new Date(base);
        tmp.setDate(base.getDate() + (FALLBACK_DAYS - 1));
        end = normalizeDateStr(tmp);
      }
      const startDate = new Date(start);
      const endDate = new Date(end);
      if(endDate < startDate){
        return { start: normalizeDateStr(endDate), end: normalizeDateStr(startDate) };
      }
      return { start, end };
    }

    function buildDateSlots(){
      const { start, end } = getDateRange();
      const out = [];
      if(!start || !end) return out;
      const current = new Date(start);
      const endDate = new Date(end);
      while(current <= endDate){
        out.push(normalizeDateStr(current));
        current.setDate(current.getDate() + 1);
      }
      return out;
    }

    function getMembersOrdered(){
      if(typeof getRosterOrdering === 'function'){
        return getRosterOrdering().flatMap(g => (g.members || []).map(m => ({
          ...m,
          groupTitle: g.title
        })));
      }
      return [];
    }

    function ensureBits(date){
      if(!bitsByDate.has(date)){
        bitsByDate.set(date, new Array(orderedMembers.length).fill(false));
      }
      const arr = bitsByDate.get(date) || [];
      if(arr.length < orderedMembers.length){
        const diff = orderedMembers.length - arr.length;
        bitsByDate.set(date, arr.concat(new Array(diff).fill(false)));
      }
    }

    function parseBitsString(raw){
      bitsByDate.clear();
      if(!raw){
        dateSlots.forEach(d => ensureBits(d));
        return;
      }
      const parts = raw.split(';').map(s => s.trim()).filter(Boolean);
      if(parts.length === 0){
        dateSlots.forEach(d => ensureBits(d));
        return;
      }
      const useSlots = dateSlots.length ? dateSlots : parts.map((_,i)=> i.toString());
      parts.forEach((part, idx)=>{
        let key = '';
        let bits = part;
        if(part.includes(':')){
          const [k,v] = part.split(':');
          key = normalizeDateStr(k) || useSlots[idx] || '';
          bits = v || '';
        }else{
          key = useSlots[idx] || '';
        }
        ensureBits(key);
        const arr = bitsByDate.get(key) || [];
        const chars = (bits||'').trim();
        for(let i=0;i<orderedMembers.length;i++){
          arr[i] = chars[i] === '1';
        }
        bitsByDate.set(key, arr);
      });
      dateSlots.forEach(d => ensureBits(d));
    }

    function serializeBits(){
      const rows = [];
      dateSlots.forEach(date => {
        const arr = bitsByDate.get(date) || [];
        const bits = orderedMembers.map((_,i)=> arr[i] ? '1' : '0').join('');
        rows.push(`${date}:${bits}`);
      });
      return rows.join(';');
    }

    function updateBitsInput(){
      if(!bitsInput) return;
      bitsInput.value = serializeBits();
    }

    function toggleBit(date, memberIdx, on){
      ensureBits(date);
      const arr = bitsByDate.get(date) || [];
      arr[memberIdx] = on;
      bitsByDate.set(date, arr);
      updateBitsInput();
    }

    function applyBitsToCells(){
      if(!tableEl) return;
      tableEl.querySelectorAll('.vac-cell').forEach(cell => {
        const date = cell.dataset.date;
        const idx = Number(cell.dataset.memberIndex || '-1');
        const arr = bitsByDate.get(date);
        const on = Array.isArray(arr) ? !!arr[idx] : false;
        cell.classList.toggle('on', on);
        cell.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
    }

    function createHeaderRow(){
      const thead = document.createElement('thead');
      const tr = document.createElement('tr');
      const blank = document.createElement('th');
      blank.textContent = 'メンバー';
      blank.className = 'group-name';
      tr.appendChild(blank);
      dateSlots.forEach(date => {
        const th = document.createElement('th');
        const d = new Date(date);
        const dow = d.getDay();
        const label = document.createElement('div');
        label.className = 'vac-day-label';
        const dateSpan = document.createElement('span');
        dateSpan.textContent = `${d.getMonth()+1}/${d.getDate()}`;
        const daySpan = document.createElement('span');
        daySpan.textContent = ['日','月','火','水','木','金','土'][dow] || '';
        daySpan.className = 'vac-day';
        if(dow === 0) th.classList.add('weekend-sun');
        if(dow === 6) th.classList.add('weekend-sat');
        label.appendChild(dateSpan);
        label.appendChild(daySpan);
        th.appendChild(label);
        tr.appendChild(th);
      });
      thead.appendChild(tr);
      return thead;
    }

    function createBodyRows(){
      const tbody = document.createElement('tbody');
      let cursor = 0;
      const grouped = (typeof getRosterOrdering === 'function') ? getRosterOrdering() : [];
      grouped.forEach(group => {
        const members = group.members || [];
        if(members.length === 0) return;
        members.forEach((member, mi) => {
          const tr = document.createElement('tr');
          if(mi === 0){
            const gth = document.createElement('th');
            gth.textContent = group.title || '';
            gth.className = 'group-name';
            gth.rowSpan = members.length;
            tr.appendChild(gth);
          }
          const nameTh = document.createElement('th');
          nameTh.textContent = member.name || '';
          nameTh.className = 'member-name';
          tr.appendChild(nameTh);
          dateSlots.forEach(date => {
            const td = document.createElement('td');
            td.className = 'vac-cell';
            td.dataset.date = date;
            td.dataset.memberIndex = String(cursor);
            const d = new Date(date);
            const dow = d.getDay();
            if(dow === 0) td.classList.add('weekend-sun');
            if(dow === 6) td.classList.add('weekend-sat');
            td.setAttribute('role', 'button');
            td.setAttribute('aria-label', `${group.title || ''} ${member.name || ''} ${date}`);
            td.setAttribute('aria-pressed', 'false');
            tr.appendChild(td);
          });
          tbody.appendChild(tr);
          cursor += 1;
        });
      });
      return tbody;
    }

    function applyHolidayColor(holidays){
      if(!holidays || !holidays.size || !tableEl) return;
      tableEl.querySelectorAll('.vac-cell').forEach(cell => {
        if(holidays.has(cell.dataset.date)){
          cell.classList.add('holiday');
        }
      });
    }

    async function resolveHolidays(){
      const set = new Set(MANUAL_HOLIDAYS.map(normalizeDateStr).filter(Boolean));
      const years = new Set(dateSlots.map(d => (new Date(d)).getFullYear()));
      if(!HOLIDAY_API_URL){
        return set;
      }
      for(const y of years){
        if(holidayCache.has(y)){
          const cached = holidayCache.get(y);
          if(cached) cached.forEach(d => set.add(d));
          continue;
        }
        try{
          const res = await fetch(HOLIDAY_API_URL, { cache: 'force-cache' });
          if(!res.ok) throw new Error('holiday_fetch_failed');
          const json = await res.json();
          const yearSet = new Set();
          Object.entries(json || {}).forEach(([k]) => {
            if(k.startsWith(`${y}-`)){
              yearSet.add(k);
              set.add(k);
            }
          });
          holidayCache.set(y, yearSet);
        }catch(err){
          console.warn('休日取得に失敗しました。週末のみ色分けにフォールバックします', err);
          holidayCache.set(y, null);
        }
      }
      return set;
    }

    function renderTable(){
      if(!ganttRoot) return;
      ganttRoot.textContent = '';
      tableEl = document.createElement('table');
      tableEl.appendChild(createHeaderRow());
      tableEl.appendChild(createBodyRows());
      ganttRoot.appendChild(tableEl);
      applyBitsToCells();
      resolveHolidays().then(set => applyHolidayColor(set));
    }

    function handlePointerDown(e){
      const cell = e.target.closest('.vac-cell');
      if(!cell) return;
      e.preventDefault();
      const idx = Number(cell.dataset.memberIndex || '-1');
      if(idx < 0) return;
      const date = cell.dataset.date;
      const currentOn = cell.classList.contains('on');
      const toValue = !currentOn;
      draggingState = { toValue };
      toggleBit(date, idx, toValue);
      cell.classList.toggle('on', toValue);
    }

    function handlePointerOver(e){
      if(!draggingState) return;
      const cell = e.target.closest('.vac-cell');
      if(!cell) return;
      const idx = Number(cell.dataset.memberIndex || '-1');
      if(idx < 0) return;
      const date = cell.dataset.date;
      toggleBit(date, idx, draggingState.toValue);
      cell.classList.toggle('on', draggingState.toValue);
    }

    function handlePointerUp(){
      draggingState = null;
    }

    function bindTableEvents(){
      if(!tableEl) return;
      tableEl.addEventListener('pointerdown', handlePointerDown);
      tableEl.addEventListener('pointerover', handlePointerOver);
      ['pointerup','pointercancel','pointerleave'].forEach(ev => tableEl.addEventListener(ev, handlePointerUp));
    }

    function rebuild(){
      if(!ganttRoot) return;
      orderedMembers = getMembersOrdered();
      dateSlots = buildDateSlots();
      parseBitsString(bitsInput?.value || '');
      renderTable();
      bindTableEvents();
    }

    function init(){
      if(initialized) return;
      initialized = true;
      if(!ganttRoot) return;
      rebuild();
      if(opts.autoBind !== false){
        if(startInput){
          startInput.addEventListener('change', rebuild);
        }
        if(endInput){
          endInput.addEventListener('change', rebuild);
        }
        if(bitsInput){
          bitsInput.addEventListener('input', ()=>{
            parseBitsString(bitsInput.value);
            applyBitsToCells();
          });
        }
      }
    }

    function reset(){
      bitsByDate.clear();
      if(tableEl){
        tableEl.querySelectorAll('.vac-cell').forEach(td => td.classList.remove('on'));
      }
      rebuild();
    }

    function loadFromString(str){
      parseBitsString(str || '');
      applyBitsToCells();
      updateBitsInput();
    }

    function setRangeAndBits(start, end, bits){
      if(startInput) startInput.value = normalizeDateStr(start) || '';
      if(endInput) endInput.value = normalizeDateStr(end) || '';
      if(bitsInput) bitsInput.value = bits || '';
      rebuild();
    }

    function getBitsString(){
      updateBitsInput();
      return bitsInput?.value || '';
    }

    if(opts.autoInit !== false){
      if(document.readyState === 'loading'){
        document.addEventListener('DOMContentLoaded', init, { once:true });
      }else{
        init();
      }
    }

    return {
      rebuild,
      reset,
      loadFromString,
      syncInput: updateBitsInput,
      init,
      setRangeAndBits,
      getBitsString,
      applyBitsToCells
    };
  }

  const defaultController = createVacationGanttController({
    rootEl: document.getElementById('vacationGantt'),
    startInput: vacationStartInput,
    endInput: vacationEndInput,
    bitsInput: vacationMembersBitsInput
  });

  window.createVacationGantt = createVacationGanttController;
  window.VacationGantt = defaultController || {
    rebuild: ()=>{},
    reset: ()=>{},
    loadFromString: ()=>{},
    syncInput: ()=>{}
  };
})();
