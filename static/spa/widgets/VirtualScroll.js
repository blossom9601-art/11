/* ============================================================
 *  VirtualScroll — 대용량 데이터 가상 스크롤
 *  ============================================================
 *  1000+ 행도 부드럽게 렌더. DOM 에는 가시 영역 + 여유분만 유지.
 *
 *  Usage:
 *    const vs = new VirtualScroll({
 *      container, rowHeight: 40, overscan: 5,
 *      renderRow: (item, index) => `<tr>...</tr>`,
 *    });
 *    vs.setData(items);
 *    vs.destroy();
 * ============================================================ */

export class VirtualScroll {
  constructor({ container, rowHeight = 40, overscan = 5, renderRow }) {
    this._container  = container;
    this._rowHeight  = rowHeight;
    this._overscan   = overscan;
    this._renderRow  = renderRow;
    this._items      = [];
    this._scrollTop  = 0;
    this._viewport   = null;
    this._content    = null;
    this._onScroll   = this._handleScroll.bind(this);

    this._build();
  }

  _build() {
    this._container.style.position = 'relative';

    this._viewport = document.createElement('div');
    this._viewport.className = 'spa-vs-viewport';
    this._viewport.style.cssText = 'overflow-y:auto;height:100%;will-change:transform;';

    this._content = document.createElement('div');
    this._content.className = 'spa-vs-content';
    this._viewport.appendChild(this._content);
    this._container.appendChild(this._viewport);

    this._viewport.addEventListener('scroll', this._onScroll, { passive: true });
  }

  setData(items) {
    this._items = items || [];
    this._content.style.height = (this._items.length * this._rowHeight) + 'px';
    this._render();
  }

  destroy() {
    if (this._viewport) {
      this._viewport.removeEventListener('scroll', this._onScroll);
    }
    this._container.innerHTML = '';
  }

  _handleScroll() {
    const st = this._viewport.scrollTop;
    if (Math.abs(st - this._scrollTop) >= this._rowHeight) {
      this._scrollTop = st;
      this._render();
    }
  }

  _render() {
    const viewH = this._viewport.clientHeight || 400;
    const start = Math.max(0, Math.floor(this._scrollTop / this._rowHeight) - this._overscan);
    const end   = Math.min(this._items.length, Math.ceil((this._scrollTop + viewH) / this._rowHeight) + this._overscan);

    let html = '';
    for (let i = start; i < end; i++) {
      const top = i * this._rowHeight;
      html += `<div class="spa-vs-row" style="position:absolute;top:${top}px;width:100%;height:${this._rowHeight}px">${this._renderRow(this._items[i], i)}</div>`;
    }
    this._content.innerHTML = html;
  }
}
