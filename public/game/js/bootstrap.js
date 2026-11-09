const loading = document.querySelector('#loading');
const start = document.querySelector('#title button');
try {
  await import('./world.js');
  loading.hidden = true;
  start.disabled = false;
  start.innerHTML = '推开这扇门 <span aria-hidden="true">↗</span>';
} catch (error) {
  console.error('Unable to start the island', error);
  loading.hidden = true;
  document.querySelector('#title').hidden = true;
  document.querySelector('#fallback').hidden = false;
  parent.postMessage({ type: 'island-status', ready: false, error: '3D 场景加载失败，请刷新重试。' }, location.origin);
}
