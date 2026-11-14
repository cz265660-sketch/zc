const $ = id => document.getElementById(id);
let catalog; let dirty = false; let busy = false;
const settings = { brand: 'brand-field', supportEmail: 'email-field', title: 'title-field', titleZh: 'titleZh-field', subtitle: 'subtitle-field', subtitleZh: 'subtitleZh-field' };
async function api(path, method = 'GET', data) {
  const response = await fetch(path, { method, credentials: 'same-origin', ...(data === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }) });
  const result = await response.json();
  if (!response.ok) { const error = new Error(result.error || '请求失败，请稍后重试'); error.status = response.status; throw error; }
  return result;
}
function message(id, value, error = false) { $(id).textContent = value; $(id).classList.toggle('error', error); }
function markDirty() { dirty = true; message('editor-message', '有尚未保存的修改'); }
function node(tag, className, value) { const el = document.createElement(tag); if (className) el.className = className; if (value) el.textContent = value; return el; }
function bindInput(v, property, caption, options = {}) {
  const label = node('label', options.wide ? 'wide' : '', caption);
  const input = node(options.multiline ? 'textarea' : 'input');
  if (!options.multiline) input.type = options.type || 'text';
  input.value = v[property]; input.maxLength = options.max || 160;
  if (options.placeholder) input.placeholder = options.placeholder;
  input.addEventListener('input', () => { v[property] = input.value; markDirty(); });
  label.append(input); return label;
}
function renderVideos() {
  $('admin-count').textContent = '(' + catalog.videos.length + ')';
  $('video-editor').replaceChildren(...catalog.videos.map((v, index) => {
    const card = node('article', 'edit-video');
    const heading = node('div', 'edit-video-heading');
    heading.append(node('span', 'edit-index', String(index + 1).padStart(2, '0')), node('h3', '', v.titleZh || v.title || '新视频'));
    const actions = node('div', 'row-actions');
    for (const [symbol, offset, caption] of [['↑', -1, '上移'], ['↓', 1, '下移']]) {
      const b = node('button', 'icon-button', symbol); b.type = 'button'; b.title = caption; b.setAttribute('aria-label', caption + ' ' + (v.titleZh || v.title));
      b.disabled = index + offset < 0 || index + offset >= catalog.videos.length;
      b.onclick = () => { [catalog.videos[index], catalog.videos[index + offset]] = [catalog.videos[index + offset], catalog.videos[index]]; markDirty(); renderVideos(); }; actions.append(b);
    }
    const remove = node('button', 'danger-button', '移除'); remove.type = 'button';
    remove.onclick = () => { if (confirm('从当前目录移除这个视频？点击“保存并发布”后才会生效。建议先导出备份。')) { catalog.videos.splice(index, 1); markDirty(); renderVideos(); } };
    actions.append(remove); heading.append(actions); card.append(heading);
    const grid = node('div', 'form-grid');
    grid.append(bindInput(v, 'title', '英文标题'), bindInput(v, 'titleZh', '中文标题'), bindInput(v, 'category', '分类（可自定义）', { max: 60, placeholder: 'Getting started / Setup / Troubleshooting' }));
    const checkLabel = node('label', 'check-label'); const check = node('input'); check.type = 'checkbox'; check.checked = v.enabled;
    check.addEventListener('change', () => { v.enabled = check.checked; markDirty(); }); checkLabel.append(check, document.createTextNode('前台显示此视频')); grid.append(checkLabel);
    grid.append(bindInput(v, 'url', 'HTTPS 视频直链', { type: 'url', wide: true, max: 2048, placeholder: 'https://your-cdn.example.com/guide.mp4' }), bindInput(v, 'poster', '封面图片链接（选填）', { type: 'url', wide: true, max: 2048, placeholder: 'https://your-cdn.example.com/cover.jpg' }), bindInput(v, 'description', '英文说明（选填）', { multiline: true, max: 600 }), bindInput(v, 'descriptionZh', '中文说明（选填）', { multiline: true, max: 600 }));
    card.append(grid);
    if (v.url) {
      const preview = node('a', 'text-link', '新窗口检查视频 ↗');
      try { const url = new URL(v.url); if (url.protocol === 'https:' && !url.username && !url.password) { preview.href = url.href; preview.target = '_blank'; preview.rel = 'noopener noreferrer'; card.append(preview); } } catch { /* Validation shown on save. */ }
    }
    return card;
  }));
  if (!catalog.videos.length) $('video-editor').append(node('p', 'empty-state', '还没有视频，点击“添加视频”开始。'));
}
async function loadEditor() {
  catalog = await api('/api/admin/catalog'); dirty = false;
  $('login-panel').hidden = true; $('editor').hidden = false; $('logout').hidden = false;
  for (const [key, id] of Object.entries(settings)) $(id).value = catalog[key];
  renderVideos(); message('editor-message', '云端内容已加载。未填写视频链接的条目会显示“即将上线”。');
}
$('login-form').addEventListener('submit', async event => {
  event.preventDefault(); $('login-button').disabled = true;
  try { await api('/api/login', 'POST', { password: $('password').value }); $('password').value = ''; await loadEditor(); }
  catch (error) { message('login-message', error.message, true); }
  finally { $('login-button').disabled = false; }
});
for (const [key, id] of Object.entries(settings)) $(id).addEventListener('input', () => { if (catalog) { catalog[key] = $(id).value; markDirty(); } });
$('add-video').onclick = () => {
  if (catalog.videos.length >= 100) { message('editor-message', '最多支持 100 个视频', true); return; }
  catalog.videos.push({ id: crypto.randomUUID(), title: 'New guide', titleZh: '新视频', category: 'Getting started', description: '', descriptionZh: '', url: '', poster: '', enabled: true });
  markDirty(); renderVideos(); $('video-editor').lastElementChild.scrollIntoView({ behavior: 'smooth', block: 'center' });
};
$('save').onclick = async () => {
  if (busy) return;
  busy = true; $('save').disabled = true;
  // Freeze the submitted snapshot. Inputs remain editable and subsequent edits are retained.
  const snapshot = JSON.stringify(catalog);
  message('editor-message', '正在保存到云端…');
  try {
    const saved = await api('/api/admin/catalog', 'PUT', JSON.parse(snapshot));
    if (JSON.stringify(catalog) === snapshot) { catalog = saved; dirty = false; message('editor-message', '✓ 已保存并发布，前台刷新后即可看到更新。'); }
    else { catalog.revision = saved.revision; dirty = true; message('editor-message', '✓ 已保存本次提交。保存期间的新修改尚未发布，请再次保存。'); }
  } catch (error) {
    message('editor-message', error.message, true);
    if (error.status === 401) message('editor-message', '登录已过期，请先导出备份，再刷新页面重新登录。', true);
  } finally { busy = false; $('save').disabled = false; }
};
$('backup').onclick = () => {
  const url = URL.createObjectURL(new Blob([JSON.stringify(catalog, null, 2)], { type: 'application/json' }));
  const link = node('a'); link.href = url; link.download = 'zc-video-guide-' + new Date().toISOString().slice(0, 10) + '.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
};
$('logout').onclick = async () => {
  if (dirty && !confirm('尚有未保存内容。确定退出？')) return;
  try { await api('/api/logout', 'POST', {}); dirty = false; location.reload(); } catch (error) { message('editor-message', error.message, true); }
};
window.addEventListener('beforeunload', event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } });
api('/api/session').then(async session => {
  if (session.authenticated) await loadEditor();
  else { message('login-message', session.configured ? '请输入管理员密码。' : '后台密码尚未设置。请按下方步骤启用。'); $('setup-help').hidden = session.configured; $('login-button').disabled = !session.configured; }
}).catch(error => message('login-message', error.message, true));
