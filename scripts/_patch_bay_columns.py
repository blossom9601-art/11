#!/usr/bin/env python3
"""
Patch tab21-frontbay.js and tab22-rearbay.js:
- Remove 용량(spec) and 펌웨어(fw) columns
- Add 업무명(work_name) and 시스템명(system_name) columns
- Reorder columns: 유형, 공간, 업무명, 시스템명, 제조사, 모델명, 일련번호, 비고
- 업무명 uses searchable dropdown with cascading 시스템명
- Change placeholder text: "유형 선택 (필수)" → "유형", "공간 선택 (필수)" → "공간"
"""
import re

FILES = [
    'static/js/_detail/tab21-frontbay.js',
    'static/js/_detail/tab22-rearbay.js',
]

for fpath in FILES:
    text = open(fpath, encoding='utf-8').read()
    orig = text

    # 1. hasSpecCol = true → false (disable spec column logic)
    text = text.replace('var hasSpecCol = true;', 'var hasSpecCol = false;')

    # 2. renderSavedRow: replace the column rendering block
    old_render = """tr.innerHTML = [
				'<td><input type="checkbox" class="hw-row-check" aria-label="행 선택"></td>',
				'<td data-col="type">'+escHtml(item && item.type ? item.type : '-')+'</td>',
				'<td data-col="space">'+escHtml(item && item.space ? item.space : '-')+'</td>',
				'<td data-col="model">'+escHtml(item && item.model ? item.model : '-')+'</td>',
				(hasSpecCol ? ('<td data-col="spec">'+escHtml(item && item.spec ? item.spec : '-')+'</td>') : ''),
				'<td data-col="serial">'+escHtml(item && item.serial ? item.serial : '-')+'</td>',
				'<td data-col="vendor">'+escHtml(item && item.vendor ? item.vendor : '-')+'</td>',
				'<td data-col="fw">'+escHtml(item && item.fw ? item.fw : '-')+'</td>',
				'<td data-col="remark">'+escHtml(item && item.remark ? item.remark : '-')+'</td>',"""
    new_render = """tr.innerHTML = [
				'<td><input type="checkbox" class="hw-row-check" aria-label="행 선택"></td>',
				'<td data-col="type">'+escHtml(item && item.type ? item.type : '-')+'</td>',
				'<td data-col="space">'+escHtml(item && item.space ? item.space : '-')+'</td>',
				'<td data-col="work_name">'+escHtml(item && item.work_name ? item.work_name : '-')+'</td>',
				'<td data-col="system_name">'+escHtml(item && item.system_name ? item.system_name : '-')+'</td>',
				'<td data-col="vendor">'+escHtml(item && item.vendor ? item.vendor : '-')+'</td>',
				'<td data-col="model">'+escHtml(item && item.model ? item.model : '-')+'</td>',
				'<td data-col="serial">'+escHtml(item && item.serial ? item.serial : '-')+'</td>',
				'<td data-col="remark">'+escHtml(item && item.remark ? item.remark : '-')+'</td>',"""
    text = text.replace(old_render, new_render)

    # 3. getPageSystemInfo: remove fw, add work_name/system_name
    text = text.replace(
        "var info = { type:'시스템', space:'-', model:'-', serial:'-', vendor:'-', fw:'-', remark:'-' };",
        "var info = { type:'시스템', space:'-', work_name:'-', system_name:'-', vendor:'-', model:'-', serial:'-', remark:'-' };"
    )

    # 4. buildSystemRow: replace column rendering
    old_sys = """tr.innerHTML = [
				'<td><input type="checkbox" class="hw-row-check" aria-label="행 선택"></td>',
				'<td data-col="type">'+d.type+'</td>',
				'<td data-col="space">'+d.space+'</td>',
				'<td data-col="model">'+d.model+'</td>',
				(hasSpecCol ? '<td data-col="spec">-</td>' : ''),
				'<td data-col="serial">'+d.serial+'</td>',
				'<td data-col="vendor">'+d.vendor+'</td>',
				'<td data-col="fw">'+d.fw+'</td>',
				'<td data-col="remark">'+d.remark+'</td>',"""
    new_sys = """tr.innerHTML = [
				'<td><input type="checkbox" class="hw-row-check" aria-label="행 선택"></td>',
				'<td data-col="type">'+d.type+'</td>',
				'<td data-col="space">'+d.space+'</td>',
				'<td data-col="work_name">'+d.work_name+'</td>',
				'<td data-col="system_name">'+d.system_name+'</td>',
				'<td data-col="vendor">'+d.vendor+'</td>',
				'<td data-col="model">'+d.model+'</td>',
				'<td data-col="serial">'+d.serial+'</td>',
				'<td data-col="remark">'+d.remark+'</td>',"""
    text = text.replace(old_sys, new_sys)

    # 5. refreshSystemRow: replace set calls
    old_refresh = """set('space', d.space);
				set('model', d.model);
				if(hasSpecCol) set('spec','-');
				set('serial', d.serial);
				set('vendor', d.vendor);
				set('fw', d.fw);
				set('remark', d.remark);"""
    new_refresh = """set('space', d.space);
				set('work_name', d.work_name);
				set('system_name', d.system_name);
				set('vendor', d.vendor);
				set('model', d.model);
				set('serial', d.serial);
				set('remark', d.remark);"""
    text = text.replace(old_refresh, new_refresh)

    # 6. persistBayRow payload: replace spec/fw with work_name/system_name
    old_payload = """var payload = {
				scope_key: scopeKey,
				asset_id: assetId,
				type: readCell(tr, 'type'),
				space: readCell(tr, 'space'),
				model: readCell(tr, 'model'),
				spec: hasSpecCol ? readCell(tr, 'spec') : '',
				serial: readCell(tr, 'serial'),
				vendor: readCell(tr, 'vendor'),
				fw: readCell(tr, 'fw'),
				remark: readCell(tr, 'remark')
			};"""
    new_payload = """var payload = {
				scope_key: scopeKey,
				asset_id: assetId,
				type: readCell(tr, 'type'),
				space: readCell(tr, 'space'),
				work_name: readCell(tr, 'work_name'),
				system_name: readCell(tr, 'system_name'),
				vendor: readCell(tr, 'vendor'),
				model: readCell(tr, 'model'),
				serial: readCell(tr, 'serial'),
				remark: readCell(tr, 'remark')
			};"""
    text = text.replace(old_payload, new_payload)

    # 7. Add-row button: replace the tr.innerHTML for new-row
    old_addrow = """tr.innerHTML = [
					'<td><input type="checkbox" class="hw-row-check" aria-label="행 선택"></td>',
					'<td data-col="type">',
						'<select class="search-select" data-searchable-scope="page" title="유형">',
							'<option value="" selected disabled>유형 선택 (필수)</option>',
							typeOptions.map(function(o){ return '<option value="'+o+'">'+o+'</option>'; }).join(''),
						'</select>',
					'</td>',
					'<td data-col="space">',
						'<select class="search-select" data-searchable-scope="page" title="공간">',
							'<option value="" selected disabled>공간 선택 (필수)</option>',
							bayOptions,
						'</select>',
					'</td>',
					'<td data-col="model"><input type="text" placeholder="모델명 (필수)"></td>',
					(hasSpecCol? '<td data-col="spec"><input type="text" placeholder="용량"></td>': ''),
					'<td data-col="serial"><input type="text" placeholder="일련번호"></td>',
					'<td data-col="vendor"><input type="text" placeholder="제조사"></td>',
					'<td data-col="fw"><input type="text" placeholder="펌웨어"></td>',
					'<td data-col="remark"><input type="text" placeholder="비고"></td>',"""
    new_addrow = """tr.innerHTML = [
					'<td><input type="checkbox" class="hw-row-check" aria-label="행 선택"></td>',
					'<td data-col="type">',
						'<select class="search-select" data-searchable-scope="page" title="유형">',
							'<option value="" selected disabled>유형</option>',
							typeOptions.map(function(o){ return '<option value="'+o+'">'+o+'</option>'; }).join(''),
						'</select>',
					'</td>',
					'<td data-col="space">',
						'<select class="search-select" data-searchable-scope="page" title="공간">',
							'<option value="" selected disabled>공간</option>',
							bayOptions,
						'</select>',
					'</td>',
					'<td data-col="work_name">',
						'<select class="search-select bay-work-select" data-searchable-scope="page" title="업무명">',
							'<option value="" selected disabled>업무명</option>',
						'</select>',
					'</td>',
					'<td data-col="system_name">',
						'<select class="search-select bay-system-select" data-searchable-scope="page" title="시스템명" disabled>',
							'<option value="" selected disabled>시스템명</option>',
						'</select>',
					'</td>',
					'<td data-col="vendor"><input type="text" placeholder="제조사"></td>',
					'<td data-col="model"><input type="text" placeholder="모델명"></td>',
					'<td data-col="serial"><input type="text" placeholder="일련번호"></td>',
					'<td data-col="remark"><input type="text" placeholder="비고"></td>',"""
    text = text.replace(old_addrow, new_addrow)

    # 8. After addBtn block — insert work-group fetching and cascading logic
    # We add it right after the addBtn click wiring, before the delete-modal code
    old_after_add = """try{ if(window.BlossomSearchableSelect && window.BlossomSearchableSelect.enhance) window.BlossomSearchableSelect.enhance(tr); }catch(_){}
				try{ hwGoLast(); }catch(_){ }
				updateEmptyState();
			});
		}

		// ── Delete-confirmation modal ──"""
    new_after_add = """try{ if(window.BlossomSearchableSelect && window.BlossomSearchableSelect.enhance) window.BlossomSearchableSelect.enhance(tr); }catch(_){}
				loadWorkGroupOptions(tr);
				try{ hwGoLast(); }catch(_){ }
				updateEmptyState();
			});
		}

		// ── 업무명/시스템명 캐스케이딩 ──
		var _cachedWorkGroups = null;
		function fetchWorkGroups(){
			if(_cachedWorkGroups) return Promise.resolve(_cachedWorkGroups);
			return fetch('/api/work-groups', { method:'GET', headers:{'Accept':'application/json'} })
				.then(function(r){ return r.json(); })
				.then(function(d){
					_cachedWorkGroups = (d && d.items) ? d.items : [];
					return _cachedWorkGroups;
				})
				.catch(function(){ _cachedWorkGroups = []; return []; });
		}
		function fetchSystems(groupId){
			return fetch('/api/work-groups/' + encodeURIComponent(String(groupId)) + '/systems', { method:'GET', headers:{'Accept':'application/json'} })
				.then(function(r){ return r.json(); })
				.then(function(d){ return (d && d.items) ? d.items : []; })
				.catch(function(){ return []; });
		}
		function loadWorkGroupOptions(tr){
			var wSel = tr.querySelector('[data-col="work_name"] select');
			var sSel = tr.querySelector('[data-col="system_name"] select');
			if(!wSel) return;
			fetchWorkGroups().then(function(groups){
				groups.forEach(function(g){
					var o = document.createElement('option');
					o.value = g.group_name || '';
					o.textContent = g.group_name || '';
					o.dataset.groupId = String(g.id);
					wSel.appendChild(o);
				});
				try{ if(window.BlossomSearchableSelect && window.BlossomSearchableSelect.enhance) window.BlossomSearchableSelect.enhance(tr); }catch(_){}
			});
			if(wSel && sSel){
				wSel.addEventListener('change', function(){
					var selected = wSel.options[wSel.selectedIndex];
					var gid = selected ? selected.dataset.groupId : '';
					sSel.innerHTML = '<option value="" selected disabled>시스템명</option>';
					sSel.disabled = true;
					if(!gid) return;
					fetchSystems(parseInt(gid,10)).then(function(systems){
						var seen = {};
						systems.forEach(function(s){
							var nm = s.system_name || '';
							if(!nm || seen[nm]) return;
							seen[nm] = true;
							var o = document.createElement('option');
							o.value = nm;
							o.textContent = nm;
							sSel.appendChild(o);
						});
						sSel.disabled = false;
						try{ if(window.BlossomSearchableSelect && window.BlossomSearchableSelect.enhance) window.BlossomSearchableSelect.enhance(tr); }catch(_){}
					});
				});
			}
		}

		// ── Delete-confirmation modal ──"""
    text = text.replace(old_after_add, new_after_add)

    # 9. Edit mode (toInput): replace to handle new columns
    old_edit = """if(target.classList.contains('js-hw-edit') || (target.classList.contains('js-hw-toggle') && target.getAttribute('data-action') === 'edit')){
				function toInput(name){
					var td = tr.querySelector('[data-col="'+name+'"]');
					if(!td) return;
					var current = (td.textContent||'').trim();
					if(name==='type'){
						if(isSystemRow(tr)) return;
						var options = ['<option value=""'+(current?'':' selected')+' disabled>유형 선택 (필수)</option>']
							.concat(typeOptions.map(function(o){ return '<option value="'+o+'"'+(o===current?' selected':'')+'>'+o+'</option>'; }))
							.join('');
						td.innerHTML = '<select class="search-select" data-searchable-scope="page" title="유형">'+options+'</select>';
						return;
					}
					if(name==='space'){
						if(isSystemRow(tr)) return;
						var bays = Array.from({length: bayCount}, function(_,i){ return 'BAY'+(i+1); });
						var opt2 = ['<option value=""'+(current?'':' selected')+' disabled>공간 선택 (필수)</option>']
							.concat(bays.map(function(o){ return '<option value="'+o+'"'+(o===current?' selected':'')+'>'+o+'</option>'; }))
							.join('');
						td.innerHTML = '<select class="search-select" data-searchable-scope="page" title="공간">'+opt2+'</select>';
						return;
					}
					if(isSystemRow(tr) && (name==='model' || name==='vendor' || name==='serial' || name==='spec')) return;
					td.innerHTML = '<input type="text" value="'+current+'">';
				}
				var editCols = ['type','space','model'];
				if(hasSpecCol) editCols.push('spec');
				editCols = editCols.concat(['serial','vendor','fw','remark']);
				editCols.forEach(toInput);
				try{ if(window.BlossomSearchableSelect && window.BlossomSearchableSelect.enhance) window.BlossomSearchableSelect.enhance(tr); }catch(_){}"""
    new_edit = """if(target.classList.contains('js-hw-edit') || (target.classList.contains('js-hw-toggle') && target.getAttribute('data-action') === 'edit')){
				function toInput(name){
					var td = tr.querySelector('[data-col="'+name+'"]');
					if(!td) return;
					var current = (td.textContent||'').trim();
					if(current === '-') current = '';
					if(name==='type'){
						if(isSystemRow(tr)) return;
						var options = ['<option value=""'+(current?'':' selected')+' disabled>유형</option>']
							.concat(typeOptions.map(function(o){ return '<option value="'+o+'"'+(o===current?' selected':'')+'>'+o+'</option>'; }))
							.join('');
						td.innerHTML = '<select class="search-select" data-searchable-scope="page" title="유형">'+options+'</select>';
						return;
					}
					if(name==='space'){
						if(isSystemRow(tr)) return;
						var bays = Array.from({length: bayCount}, function(_,i){ return 'BAY'+(i+1); });
						var opt2 = ['<option value=""'+(current?'':' selected')+' disabled>공간</option>']
							.concat(bays.map(function(o){ return '<option value="'+o+'"'+(o===current?' selected':'')+'>'+o+'</option>'; }))
							.join('');
						td.innerHTML = '<select class="search-select" data-searchable-scope="page" title="공간">'+opt2+'</select>';
						return;
					}
					if(name==='work_name'){
						if(isSystemRow(tr)) return;
						td.innerHTML = '<select class="search-select bay-work-select" data-searchable-scope="page" title="업무명"><option value="" disabled>업무명</option></select>';
						var wSel = td.querySelector('select');
						fetchWorkGroups().then(function(groups){
							groups.forEach(function(g){
								var o = document.createElement('option');
								o.value = g.group_name || '';
								o.textContent = g.group_name || '';
								o.dataset.groupId = String(g.id);
								if(o.value === current) o.selected = true;
								wSel.appendChild(o);
							});
							if(!current){ wSel.querySelector('option[disabled]').selected = true; }
							try{ if(window.BlossomSearchableSelect && window.BlossomSearchableSelect.enhance) window.BlossomSearchableSelect.enhance(tr); }catch(_){}
							// Wire cascading
							var sTd = tr.querySelector('[data-col="system_name"]');
							var sSel = sTd ? sTd.querySelector('select') : null;
							if(wSel && sSel){
								wSel.addEventListener('change', function(){
									var sel = wSel.options[wSel.selectedIndex];
									var gid = sel ? sel.dataset.groupId : '';
									sSel.innerHTML = '<option value="" selected disabled>시스템명</option>';
									sSel.disabled = true;
									if(!gid) return;
									fetchSystems(parseInt(gid,10)).then(function(systems){
										var seen = {};
										systems.forEach(function(s){
											var nm = s.system_name || '';
											if(!nm || seen[nm]) return;
											seen[nm] = true;
											var o2 = document.createElement('option');
											o2.value = nm; o2.textContent = nm;
											sSel.appendChild(o2);
										});
										sSel.disabled = false;
										try{ if(window.BlossomSearchableSelect && window.BlossomSearchableSelect.enhance) window.BlossomSearchableSelect.enhance(tr); }catch(_){}
									});
								});
								// Trigger load if current value exists
								if(current) wSel.dispatchEvent(new Event('change'));
							}
						});
						return;
					}
					if(name==='system_name'){
						if(isSystemRow(tr)) return;
						td.innerHTML = '<select class="search-select bay-system-select" data-searchable-scope="page" title="시스템명" disabled><option value="" selected disabled>시스템명</option></select>';
						td._pendingSystemValue = current;
						return;
					}
					if(isSystemRow(tr) && (name==='model' || name==='vendor' || name==='serial')) return;
					td.innerHTML = '<input type="text" value="'+escHtml(current)+'">';
				}
				var editCols = ['type','space','work_name','system_name','vendor','model','serial','remark'];
				editCols.forEach(toInput);
				try{ if(window.BlossomSearchableSelect && window.BlossomSearchableSelect.enhance) window.BlossomSearchableSelect.enhance(tr); }catch(_){}"""
    text = text.replace(old_edit, new_edit)

    # 10. Save handler: update commit section for system row
    old_sys_commit = """if(isSystemRow(tr)){
					var d = getPageSystemInfo();
					commit('type', '시스템');
					commit('space', '-');
					commit('model', d.model);
					if(hasSpecCol) commit('spec', '-');
					commit('serial', d.serial);
					commit('vendor', d.vendor);
				} else {
					commit('type', typeVal);
					commit('space', spaceVal);
					commit('model', modelVal);
					if(hasSpecCol) commit('spec', read('spec'));
					commit('serial', read('serial'));
					commit('vendor', read('vendor'));
				}
				commit('fw', read('fw'));
				commit('remark', read('remark'));"""
    new_sys_commit = """if(isSystemRow(tr)){
					var d = getPageSystemInfo();
					commit('type', '시스템');
					commit('space', '-');
					commit('work_name', d.work_name);
					commit('system_name', d.system_name);
					commit('vendor', d.vendor);
					commit('model', d.model);
					commit('serial', d.serial);
				} else {
					commit('type', typeVal);
					commit('space', spaceVal);
					var workSel = (function(){ var td = tr.querySelector('[data-col="work_name"]'); return td? td.querySelector('select'): null; })();
					commit('work_name', workSel ? workSel.value : read('work_name'));
					var sysSel = (function(){ var td = tr.querySelector('[data-col="system_name"]'); return td? td.querySelector('select'): null; })();
					commit('system_name', sysSel ? sysSel.value : read('system_name'));
					commit('vendor', read('vendor'));
					commit('model', modelVal);
					commit('serial', read('serial'));
				}
				commit('remark', read('remark'));"""
    text = text.replace(old_sys_commit, new_sys_commit)

    # 11. CSV export: update headers and columns
    old_csv = """var headers = ['유형','공간','모델명','용량','일련번호','제조사','펌웨어','비고'];"""
    new_csv = """var headers = ['유형','공간','업무명','시스템명','제조사','모델명','일련번호','비고'];"""
    text = text.replace(old_csv, new_csv)

    old_csv_cols = """var baseCols = ['type','space','model','spec','serial','vendor','fw','remark'];"""
    new_csv_cols = """var baseCols = ['type','space','work_name','system_name','vendor','model','serial','remark'];"""
    text = text.replace(old_csv_cols, new_csv_cols)

    # Write back
    with open(fpath, 'w', encoding='utf-8', newline='\n') as f:
        f.write(text)

    changes = sum(1 for a, b in zip(orig, text) if a != b) + abs(len(orig) - len(text))
    print(f'{fpath}: patched ({changes} char diffs)')

print('Done.')
