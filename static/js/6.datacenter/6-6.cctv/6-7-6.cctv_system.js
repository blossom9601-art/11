// Climatic chamber systems list minimal wiring (mirrors access systems structure)
(function(){
	'use strict';
	const KEY='cctv:systems';
	function load(){ try { return JSON.parse(localStorage.getItem(KEY)||'[]'); } catch(_) { return []; } }
	function save(v){ localStorage.setItem(KEY, JSON.stringify(v||[])); }
	function qs(id){ return document.getElementById(id); }

	function render(){
		const rows = load();
		const tbody = qs('systems-table-body'); if(!tbody) return;
		tbody.innerHTML = rows.map((r,idx)=>{
			return `<tr>
				<td><input type="checkbox" data-index="${idx}"></td>
				<td>${r.task_name||''}</td>
				<td>${r.vendor||''}</td>
				<td>${r.model||''}</td>
				<td>${r.serial||''}</td>
				<td>${r.place||''}</td>
				<td>${r.location||''}</td>
				<td>${r.zone||''}</td>
				<td>${r.ip||''}</td>
				<td>${r.auth||''}</td>
				<td></td>
			</tr>`;
		}).join('');
		const cnt = qs('systems-count'); if (cnt) cnt.textContent = String(rows.length);
		const info = qs('systems-pagination-info'); if(info) info.textContent = rows.length? `1-${rows.length} / ${rows.length}개 항목` : '0-0 / 0개 항목';
	}

	// Seed sample data if empty
	if (!localStorage.getItem(KEY)){
		save([
			{ task_name:'CCTV', vendor:'Hanwha', model:'XNO-6085R', serial:'CAM-0001', place:'퓨처센터(5층)', location:'서고5층', zone:'A', ip:'10.10.5.11', auth:'-', status:'online' },
			{ task_name:'CCTV', vendor:'Axis', model:'P3245-LV', serial:'CAM-0002', place:'퓨처센터(6층)', location:'서고6층', zone:'B', ip:'10.10.6.12', auth:'-', status:'online' },
			{ task_name:'CCTV', vendor:'Hikvision', model:'DS-2CD2143G2', serial:'CAM-0003', place:'을지트윈타워(15층)', location:'서고15층', zone:'C', ip:'10.20.15.21', auth:'-', status:'offline' },
			{ task_name:'CCTV', vendor:'Hanwha', model:'XNP-8300RW', serial:'CAM-0004', place:'재해복구센터(4층)', location:'서고4층', zone:'D', ip:'10.30.4.31', auth:'-', status:'online' }
		]);
	}

	render();
})();
