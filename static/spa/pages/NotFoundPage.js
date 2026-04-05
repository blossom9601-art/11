export default function NotFoundPage(container) {
  container.innerHTML = `
    <div class="spa-page spa-page--center">
      <h1>404</h1>
      <p>페이지를 찾을 수 없습니다.</p>
      <a href="/spa/" class="spa-btn spa-btn--primary">대시보드로 이동</a>
    </div>`;
  return { destroy() { container.innerHTML = ''; } };
}
