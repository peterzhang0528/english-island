const loading = document.querySelector('#loading');
const start = document.querySelector('#title button');
const requested = Number(new URLSearchParams(location.search).get('level') || 4);
try {
  const { chapter } = await import('./world-story.js');
  loading.hidden = true;
  start.disabled = false;
  start.replaceChildren(document.createTextNode(`开始第 ${String(chapter.id).padStart(2, '0')} 关 `));
  const arrow = document.createElement('span');
  arrow.setAttribute('aria-hidden', 'true');
  arrow.textContent = '↗';
  start.append(arrow);
} catch (error) {
  console.error('Unable to start this chapter', error);
  loading.hidden = true;
  document.querySelector('#title').hidden = true;
  document.querySelector('#fallback').hidden = false;
  parent.postMessage({ type: 'island-status', level: requested >= 4 && requested <= 10 ? requested : 4, ready: false, error: '这一关暂时没有加载成功，请刷新重试。' }, location.origin);
}
