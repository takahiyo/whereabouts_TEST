/* お知らせ機能 */

let CURRENT_NOTICES = [];

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

// お知らせを描画
function renderNotices(notices) {
  const noticesArea = document.getElementById('noticesArea');
  const noticesList = document.getElementById('noticesList');
  
  if (!notices || notices.length === 0) {
    noticesArea.style.display = 'none';
    return;
  }
  
  noticesList.innerHTML = '';
  
  notices.forEach((notice, index) => {
    const item = document.createElement('div');
    const hasContent = notice.content && notice.content.trim();
    
    if (hasContent) {
      // タイトルと内容がある場合：トグル可能
      item.className = 'notice-item';
      item.innerHTML = `
        <div class="notice-header">
          <span class="notice-toggle">➤</span>
          <span class="notice-title">${escapeHtml(notice.title || '')}</span>
        </div>
        <div class="notice-content">${linkifyText(notice.content)}</div>
      `;
      
      item.querySelector('.notice-header').addEventListener('click', () => {
        item.classList.toggle('expanded');
      });
    } else {
      // タイトルのみの場合：トグル不要
      item.className = 'notice-item title-only';
      item.innerHTML = `
        <div class="notice-header">
          <span class="notice-title">${escapeHtml(notice.title || '')}</span>
        </div>
      `;
    }
    
    noticesList.appendChild(item);
  });
  
  noticesArea.style.display = 'block';
}

// お知らせを取得
async function fetchNotices() {
  if (!SESSION_TOKEN) return;
  
  try {
    const res = await apiPost({ action: 'getNotices', token: SESSION_TOKEN, nocache: '1' });
    console.log('fetchNotices response:', res);
    if (res && res.notices) {
      CURRENT_NOTICES = res.notices;
      renderNotices(CURRENT_NOTICES);
    } else if (res && res.error) {
      console.error('fetchNotices error:', res.error);
    }
  } catch (e) {
    console.error('お知らせ取得エラー:', e);
  }
}

// お知らせを保存（管理者のみ）
async function saveNotices(notices) {
  if (!SESSION_TOKEN) return false;
  
  try {
    const res = await apiPost({
      action: 'setNotices',
      token: SESSION_TOKEN,
      notices: JSON.stringify(notices)
    });
    
    console.log('setNotices response:', res);
    
    if (res && res.ok) {
      CURRENT_NOTICES = res.notices || [];
      renderNotices(CURRENT_NOTICES);
      return true;
    } else if (res && res.error === 'forbidden') {
      toast('お知らせの編集権限がありません');
      return false;
    } else if (res && res.error) {
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
