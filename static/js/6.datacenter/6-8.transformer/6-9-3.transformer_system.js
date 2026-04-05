// Climatic chamber systems list minimal wiring (mirrors access systems structure)
(function(){
	'use strict';
	const KEY='transformer:systems';
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
			{ task_name:'Transformer', vendor:'Siemens', model:'SIVACON-T1', serial:'TR-0001', place:'퓨처센터(5층)', location:'전기실5F', zone:'A', capacity_kva:500, status:'online' },
			{ task_name:'Transformer', vendor:'ABB', model:'TXpert', serial:'TR-0002', place:'퓨처센터(6층)', location:'전기실6F', zone:'B', capacity_kva:750, status:'online' },
			{ task_name:'Transformer', vendor:'Hyosung', model:'PowerX', serial:'TR-0003', place:'을지트윈타워(15층)', location:'전기실15F', zone:'C', capacity_kva:1500, status:'maintenance' },
			{ task_name:'Transformer', vendor:'LS', model:'Tri-Transformer', serial:'TR-0004', place:'재해복구센터(4층)', location:'전기실4F', zone:'D', capacity_kva:300, status:'offline' }
		]);
	}

	render();
})();
