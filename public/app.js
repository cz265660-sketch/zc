let catalog;
let language = localStorage.getItem('zc-language') || 'en';
let selected = null;
const $ = id => document.getElementById(id);
const t = (en, zh) => language === 'zh' ? zh : en;
const field = (item, key) => language === 'zh' ? item[key + 'Zh'] || item[key] : item[key];
const categoryName = name => name === null ? t('All guides', '全部指南') : ({ 'Getting started': t('Getting started', '初次使用'), 'Setup': t('Setup', '基础设置'), 'Troubleshooting': t('Troubleshooting', '常见问题') })[name] || name;
function element(tag, className, value) { const node = document.createElement(tag); if (className) node.className = className; if (value) node.textContent = value; return node; }
function applyLanguage() {
  document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en';
  document.querySelectorAll('[data-en]').forEach(node => node.textContent = node.dataset[language]);
  $('search').placeholder = t('Find a guide', '搜索使用指南');
  if (catalog) render();
}
function openVideo(video) {
  if (!video.url) return;
  $('player-title').textContent = field(video, 'title');
  $('player-description').textContent = field(video, 'description');
  $('player-error').hidden = true;
  $('player').poster = video.poster;
  $('player').src = video.url;
  $('player-dialog').showModal();
  $('player').play().catch(() => { /* Native play button remains available if autoplay is restricted. */ });
}
function render() {
  $('brand').textContent = catalog.brand;
  $('footer-brand').textContent = catalog.brand;
  $('title').textContent = field(catalog, 'title');
  $('subtitle').textContent = field(catalog, 'subtitle');
  document.title = field(catalog, 'title') + ' · ' + catalog.brand;
  const featured = catalog.videos.find(v => v.url);
  $('feature-play').disabled = !featured;
  $('feature-play').replaceChildren(element('span', 'play-small', '▶'), element('span', '', featured ? t('Watch the first guide', '观看第一个指南') : t('Videos coming soon', '视频即将上线')));
  $('feature-play').onclick = () => featured && openVideo(featured);
  const categories = [null, ...new Set(catalog.videos.map(v => v.category))];
  if (!categories.includes(selected)) selected = null;
  $('categories').replaceChildren(...categories.map(name => {
    const button = element('button', 'tab' + (name === selected ? ' active' : ''), categoryName(name));
    button.type = 'button'; button.setAttribute('aria-pressed', String(name === selected));
    button.onclick = () => { selected = name; render(); }; return button;
  }));
  const query = $('search').value.trim().toLowerCase();
  const filtered = catalog.videos.filter(v => (selected === null || v.category === selected) && [v.title, v.titleZh, v.description, v.descriptionZh, categoryName(v.category)].join(' ').toLowerCase().includes(query));
  $('video-count').textContent = catalog.videos.length + t(' helpful guides', ' 个使用指南');
  $('videos').replaceChildren(...filtered.map((v, i) => {
    const card = element('button', 'video-card'); card.type = 'button'; card.disabled = !v.url;
    const thumb = element('div', 'video-thumbnail tone-' + (catalog.videos.indexOf(v) % 4));
    if (v.poster) {
      const img = element('img'); img.src = v.poster; img.alt = ''; img.loading = 'lazy';
      img.addEventListener('error', () => img.remove()); thumb.append(img);
    }
    thumb.append(element('span', 'thumbnail-index', String(catalog.videos.indexOf(v) + 1).padStart(2, '0')));
    thumb.append(element('span', 'thumbnail-play', v.url ? '▶' : '＋'));
    thumb.append(element('span', 'thumbnail-label', v.url ? t('WATCH GUIDE', '观看指南') : t('COMING SOON', '即将上线')));
    card.append(thumb, element('span', 'card-category', categoryName(v.category)), element('h3', '', field(v, 'title')));
    if (field(v, 'description')) card.append(element('p', '', field(v, 'description')));
    card.append(element('span', 'card-link', v.url ? t('Watch video ↗', '观看视频 ↗') : t('Video is being prepared', '视频准备中')));
    card.onclick = () => openVideo(v); return card;
  }));
  if (!filtered.length) $('videos').append(element('div', 'empty-state', query ? t('No matching guides. Try another search.', '没有找到相关指南，请换个关键词。') : t('Your guides will be here soon.', '使用指南即将上线。')));
  if (catalog.supportEmail) {
    $('support').href = 'mailto:' + catalog.supportEmail; $('support').removeAttribute('download'); $('support').textContent = t('Contact support ↗', '联系客服 ↗');
  }
}
$('language').onclick = () => { language = language === 'en' ? 'zh' : 'en'; localStorage.setItem('zc-language', language); applyLanguage(); };
$('search').addEventListener('input', () => catalog && render());
$('close-player').onclick = () => $('player-dialog').close();
$('player-dialog').addEventListener('click', event => { if (event.target === $('player-dialog')) $('player-dialog').close(); });
$('player-dialog').addEventListener('close', () => { $('player').pause(); $('player').removeAttribute('src'); $('player').load(); });
$('player').addEventListener('error', () => { if (!$('player').getAttribute('src')) return; $('player-error').textContent = t('This video could not be loaded. Check your connection or try again later.', '视频暂时无法加载，请检查网络或稍后再试。'); $('player-error').hidden = false; });
applyLanguage();
fetch('/api/catalog').then(async response => { if (!response.ok) throw new Error(); catalog = await response.json(); render(); }).catch(() => { $('videos').replaceChildren(); $('load-error').textContent = t('Guides could not be loaded. Please refresh to try again.', '指南加载失败，请刷新页面重试。'); $('load-error').hidden = false; });
