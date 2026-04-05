// 상면 관리 - 을지트윈타워(15층): PNG 배경 위에 클릭 가능한 RACK 태그 오버레이
(function() {
	'use strict';

	const COLS = ['A','B','C','D','E'];
	const ROWS = Array.from({ length: 8 }, (_, i) => i + 1);

	function rackIds() {
		const ids = [];
		for (const c of COLS) for (const r of ROWS) ids.push(`15F-${c}-${r}`);
		return ids;
	}

	function placeTags(container) {
		// Preserve existing content (overlay controls, background, etc.).
		// When we add auto-generated rack tags, remove only those specific nodes instead of wiping the container.
		// For now, no-op to avoid removing the edit/create buttons.
	}

	function init() {
		const mapEl = document.getElementById('floor-map');
		if (!mapEl) return;
		let rafId = 0;
		const rerender = () => {
			cancelAnimationFrame(rafId);
			rafId = requestAnimationFrame(() => placeTags(mapEl));
		};
		window.addEventListener('resize', rerender);
		rerender();
	}

	document.addEventListener('DOMContentLoaded', init);
})();
