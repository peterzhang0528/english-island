const loading = document.querySelector('#loading');
const start = document.querySelector('#title button');
try {
  await import('./world2.js');
  loading.hidden = true;
  start.disabled = false;
  start.innerHTML = '一起做个蛋糕 <span aria-hidden="true">↗</span>';
} catch (error) {
  console.error('Unable to start the farm', error);
  loading.hidden = true;
  document.querySelector('#title').hidden = true;
  document.querySelector('#fallback').hidden = false;
  parent.postMessage({ type: 'island-status', level: 2, ready: false, error: '农场加载失败，请刷新重试。' }, location.origin);
}
