// Climatic chamber systems list minimal wiring (mirrors access systems structure)
(function(){
	'use strict';
	const KEY='climatic:systems';
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
			{ task_name:'항온항습기', vendor:'Munters', model:'MNT-300', serial:'CC-0001', place:'퓨처센터', location:'서관5층', zone:'A', ip:'10.0.10.11', auth:'-' },
			{ task_name:'항온항습기', vendor:'STULZ', model:'STZ-450', serial:'CC-0002', place:'퓨처센터', location:'서관6층', zone:'B', ip:'10.0.10.12', auth:'-' }
		]);
	}

	render();
})();
