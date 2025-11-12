/* お知らせ機能 */

let CURRENT_NOTICES = [];
const MAX_NOTICE_ITEMS = 100;

// URLを自動リンク化する関数
function linkifyText(text) {
  if (!text) return '';
  
  // URL正規表現（http, https, ftp対応）
  const urlRegex = /(https?:\/\/[^\s]+|ftps?:\/\/[^\s]+)/gi;
  
  return text.replace(urlRegex, (url) => {
    return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(url)}</a>`;
  });
}

// HTMLエスケープ
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function coerceNoticeArray(raw) {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    if (trimmed[0] === '[' || trimmed[0] === '{') {
      try {
        return coerceNoticeArray(JSON.parse(trimmed));
      } catch (_) {
        // treat as plain text fallback
      }
    }
    return [trimmed];
  }
  if (typeof raw === 'object') {
    if (Array.isArray(raw.list)) return raw.list;
    if (Array.isArray(raw.items)) return raw.items;
    return Object.keys(raw)
      .sort()
      .map((key) => raw[key])
      .filter((value) => value != null);
  }
  return [];
}

function normalizeNoticeEntries(raw) {
  const arr = coerceNoticeArray(raw);
  const normalized = arr
    .map((item) => {
      if (item == null) return null;
      if (typeof item === 'string') {
        const text = item.trim();
        if (!text) return null;
        return { title: text.slice(0, 200), content: '' };
      }
      if (Array.isArray(item)) {
        const titleRaw = item[0] == null ? '' : String(item[0]);
        const contentRaw = item[1] == null ? '' : String(item[1]);
        const title = titleRaw.slice(0, 200);
        const content = contentRaw.slice(0, 2000);
        if (!title.trim() && !content.trim()) return null;
        return { title, content };
      }
      if (typeof item === 'object') {
        const titleSource =
          item.title ?? item.subject ?? item.headline ?? '';
        const contentSource =
          item.content ?? item.body ?? item.text ?? item.description ?? '';
        const titleStr = titleSource == null ? '' : String(titleSource);
        const contentStr = contentSource == null ? '' : String(contentSource);
        const title = titleStr.slice(0, 200);
        const content = contentStr.slice(0, 2000);
        if (!title.trim() && !content.trim()) return null;
        return { title, content };
      }
      return null;
    })
    .filter(Boolean);
  if (normalized.length > MAX_NOTICE_ITEMS) {
    return normalized.slice(0, MAX_NOTICE_ITEMS);
  }
  return normalized;
}

function applyNotices(raw) {
  const normalized = normalizeNoticeEntries(raw);
  CURRENT_NOTICES = normalized;
  renderNotices(normalized);
}

// お知らせを描画
function renderNotices(notices) {
  const noticesArea = document.getElementById('noticesArea');
  const noticesList = document.getElementById('noticesList');
  const noticesSummary = document.getElementById('noticesSummary');
  const noticesBtn = document.getElementById('noticesBtn');
  
  if (!noticesArea || !noticesList) return;

  const list = Array.isArray(notices) ? notices : normalizeNoticeEntries(notices);

  if (!list || list.length === 0) {
    noticesList.innerHTML = '';
    noticesArea.style.display = 'none';
    if (noticesBtn) noticesBtn.style.display = 'none';
    return;
  }

  noticesList.innerHTML = '';

  list.forEach((notice) => {
    const title = notice && notice.title != null ? String(notice.title) : '';
    const content = notice && notice.content != null ? String(notice.content) : '';
    const hasContent = content.trim().length > 0;

    const item = document.createElement('div');
    if (hasContent) {
      item.className = 'notice-item';
      item.innerHTML = `
        <div class="notice-header">
          <span class="notice-toggle">➤</span>
          <span class="notice-title">${escapeHtml(title)}</span>
        </div>
        <div class="notice-content">${linkifyText(content)}</div>
      `;
      item.querySelector('.notice-header').addEventListener('click', () => {
        item.classList.toggle('expanded');
      });
    } else {
      item.className = 'notice-item title-only';
      item.innerHTML = `
        <div class="notice-header">
          <span class="notice-title">${escapeHtml(title)}</span>
        </div>
      `;
    }
    noticesList.appendChild(item);
  });

  // サマリー更新
  if (noticesSummary) {
    const firstTitle = list[0] && list[0].title ? String(list[0].title) : '';
    const remaining = list.length - 1;
    if (remaining > 0) {
      noticesSummary.textContent = `${escapeHtml(firstTitle)} (他${remaining}件)`;
    } else {
      noticesSummary.textContent = escapeHtml(firstTitle);
    }
  }

  noticesArea.style.display = 'block';
  if (noticesBtn) noticesBtn.style.display = 'inline-block';
  
  // デフォルトで展開状態にする
  noticesArea.classList.remove('collapsed');
}

// お知らせエリアの開閉トグル
function toggleNoticesArea() {
  const noticesArea = document.getElementById('noticesArea');
  if (!noticesArea) return;
  
  noticesArea.classList.toggle('collapsed');
}

// お知らせを取得
async function fetchNotices() {
  if (!SESSION_TOKEN) return;
  
  try {
    const params = {
      action: 'getNotices',
      token: SESSION_TOKEN,
      nocache: '1'
    };
    const officeId = CURRENT_OFFICE_ID || '';
    if (officeId) {
      params.office = officeId;
    }

    const res = await apiPost(params);
    console.log('fetchNotices response:', res);
    if (res && Object.prototype.hasOwnProperty.call(res, 'notices')) {
      applyNotices(res.notices);
    } else if (res && res.error) {
      if (res.error === 'unauthorized') {
        toast('セッションの有効期限が切れました。再度ログインしてください', false);
        await logout();
        stopNoticesPolling();
      } else {
        console.error('fetchNotices error:', res.error);
      }
    }
  } catch (e) {
    console.error('お知らせ取得エラー:', e);
  }
}

// お知らせを保存（管理者のみ）
async function saveNotices(notices, office) {
  if (!SESSION_TOKEN) return false;
  
  try {
    const payload = normalizeNoticeEntries(notices);
    const params = {
      action: 'setNotices',
      token: SESSION_TOKEN,
      notices: JSON.stringify(payload)
    };
    
    const targetOffice = office || CURRENT_OFFICE_ID || '';
    if (targetOffice) {
      params.office = targetOffice;
    }
    
    const res = await apiPost(params);
    
    console.log('setNotices response:', res);
    
    if (res && res.ok) {
      const nextNotices = Object.prototype.hasOwnProperty.call(res, 'notices')
        ? res.notices
        : payload;
      applyNotices(nextNotices || []);
      return true;
    }

    if (res && res.error === 'forbidden') {
      toast('お知らせの編集権限がありません');
      return false;
    }

    if (res && res.error === 'unauthorized') {
      toast('セッションの有効期限が切れました。再度ログインしてください', false);
      await logout();
      return false;
    }

    if (res && res.error) {
      toast('エラー: ' + res.error);
      return false;
    }
  } catch (e) {
    console.error('お知らせ保存エラー:', e);
    toast('通信エラーが発生しました');
  }
  
  return false;
}

// お知らせの自動更新（ポーリング）
let noticesPollingTimer = null;

function startNoticesPolling() {
  if (noticesPollingTimer) return;
  
  // 初回取得
  fetchNotices();
  
  // 30秒ごとに更新
  noticesPollingTimer = setInterval(() => {
    if (SESSION_TOKEN) {
      fetchNotices();
    } else {
      stopNoticesPolling();
    }
  }, 30000);
}

function stopNoticesPolling() {
  if (noticesPollingTimer) {
    clearInterval(noticesPollingTimer);
    noticesPollingTimer = null;
  }
}
