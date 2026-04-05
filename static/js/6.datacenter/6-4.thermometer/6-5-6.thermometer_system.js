// Thermometer systems list minimal wiring (mirrors access systems structure)
(function(){
	'use strict';
	const KEY='thermo:systems';
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
			{ task_name:'온습도 모니터', vendor:'Honeywell', model:'HT-100', serial:'TH-0001', place:'퓨처센터', location:'서관5층', zone:'A', ip:'10.0.0.11', auth:'-' },
			{ task_name:'온습도 모니터', vendor:'Bosch', model:'BT-200', serial:'TH-0002', place:'퓨처센터', location:'서관6층', zone:'B', ip:'10.0.0.12', auth:'-' }
		]);
	}

	render();
})();
