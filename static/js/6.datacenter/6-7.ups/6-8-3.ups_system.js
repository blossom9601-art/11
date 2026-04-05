// Climatic chamber systems list minimal wiring (mirrors access systems structure)
(function(){
	'use strict';
	const KEY='ups:systems';
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
			{ task_name:'UPS', vendor:'Eaton', model:'9PX 3000i', serial:'UPS-0001', place:'퓨처센터(5층)', location:'전산실5F', zone:'A', ip:'10.50.5.11', auth:'-', status:'online', battery:88, load:42 },
			{ task_name:'UPS', vendor:'APC', model:'Smart-UPS 1500', serial:'UPS-0002', place:'퓨처센터(6층)', location:'전산실6F', zone:'B', ip:'10.50.6.12', auth:'-', status:'online', battery:76, load:35 },
			{ task_name:'UPS', vendor:'Huawei', model:'UPS2000-G', serial:'UPS-0003', place:'을지트윈타워(15층)', location:'전산실15F', zone:'C', ip:'10.60.15.21', auth:'-', status:'maintenance', battery:65, load:50 },
			{ task_name:'UPS', vendor:'Eaton', model:'9PX 2200i', serial:'UPS-0004', place:'재해복구센터(4층)', location:'전산실4F', zone:'D', ip:'10.70.4.31', auth:'-', status:'offline', battery:0, load:0 }
		]);
	}

	render();
})();
