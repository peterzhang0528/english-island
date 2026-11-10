const loading = document.querySelector('#loading');
const start = document.querySelector('#title button');
try {
  await import('./world3.js');
  loading.hidden = true;
  start.disabled = false;
  start.innerHTML = '开始在小岛上走走 <span aria-hidden="true">↗</span>';
} catch (error) {
  console.error('Unable to start the open island', error);
  loading.hidden = true;
  document.querySelector('#title').hidden = true;
  document.querySelector('#fallback').hidden = false;
  parent.postMessage({ type: 'island-status', level: 3, ready: false, error: '小岛加载失败，请刷新重试。' }, location.origin);
}
