(function () {
	function qs(id) { return document.getElementById(id); }
	function setStatus(text, ok) {
		var el = qs('fp-status');
		if (!el) return;
		el.textContent = text || '';
		el.style.color = ok ? '#2563eb' : '#b91c1c';
	}
	function toBool(v) { return !!v; }
	function toInt(v, d) {
		var n = parseInt(v, 10);
		return isNaN(n) ? d : n;
	}

	function getPolicyPayload() {
		return {
			max_file_size_mb: toInt(qs('fp-max-size').value, 20),
			allowed_extensions: (qs('fp-allowed-ext').value || '').trim(),
			blocked_extensions: (qs('fp-blocked-ext').value || '').trim(),
			file_name_pattern: (qs('fp-name-rule').value || '').trim(),
			allow_duplicate_upload: toBool(qs('fp-allow-duplicate').checked),
			block_executable_upload: toBool(qs('fp-block-exec').checked),
			validate_mime_type: toBool(qs('fp-validate-mime').checked),
			validate_magic_bytes: toBool(qs('fp-validate-magic').checked),
			detect_extension_spoofing: toBool(qs('fp-detect-spoof').checked),
			enable_virus_scan: toBool(qs('fp-virus').checked),
			inherit_record_permission: toBool(qs('fp-inherit').checked),
			enable_download_log: toBool(qs('fp-download-log').checked),
			allow_external_share: toBool(qs('fp-share').checked),
			allow_admin_force_access: toBool(qs('fp-admin-force').checked),
			retention_days_after_closed: toInt(qs('fp-retention-days').value, 365),
			archive_days_if_unaccessed: toInt(qs('fp-archive-days').value, 180),
			exclude_important_from_retention: toBool(qs('fp-retention-exclude').checked),
			enable_expiry_notification: toBool(qs('fp-retention-notify').checked)
		};
	}

	function bindPolicyToForm(item) {
		item = item || {};
		qs('fp-max-size').value = item.max_file_size_mb || 20;
		qs('fp-allowed-ext').value = item.allowed_extensions || '';
		qs('fp-blocked-ext').value = item.blocked_extensions || '';
		qs('fp-name-rule').value = item.file_name_pattern || '';
		qs('fp-allow-duplicate').checked = !!item.allow_duplicate_upload;
		qs('fp-block-exec').checked = !!item.block_executable_upload;
		qs('fp-validate-mime').checked = !!item.validate_mime_type;
		qs('fp-validate-magic').checked = !!item.validate_magic_bytes;
		qs('fp-detect-spoof').checked = !!item.detect_extension_spoofing;
		qs('fp-virus').checked = !!item.enable_virus_scan;
		qs('fp-inherit').checked = !!item.inherit_record_permission;
		qs('fp-download-log').checked = !!item.enable_download_log;
		qs('fp-share').checked = !!item.allow_external_share;
		qs('fp-admin-force').checked = !!item.allow_admin_force_access;
		qs('fp-retention-days').value = item.retention_days_after_closed || 365;
		qs('fp-archive-days').value = item.archive_days_if_unaccessed || 180;
		qs('fp-retention-exclude').checked = !!item.exclude_important_from_retention;
		qs('fp-retention-notify').checked = !!item.enable_expiry_notification;
	}

	function fetchPolicy() {
		setStatus('정책을 불러오는 중입니다.', true);
		return fetch('/api/file-policy')
			.then(function (r) { return r.json(); })
			.then(function (res) {
				if (!res || !res.success) throw new Error((res && res.error) || '정책 조회 실패');
				bindPolicyToForm(res.item || {});
				setStatus('', true);
			});
	}

	function savePolicy() {
		setStatus('정책 저장 중입니다.', true);
		return fetch('/api/file-policy', {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(getPolicyPayload())
		})
			.then(function (r) { return r.json(); })
			.then(function (res) {
				if (!res || !res.success) throw new Error((res && res.error) || '정책 저장 실패');
				setStatus('파일 정책을 저장했습니다.', true);
			});
	}

	var ARC_LEN = 251.33;
	var CX = 100, CY = 115, R = 80;

	function buildTicks(groupId, maxVal, step) {
		var g = document.getElementById(groupId);
		if (!g) return;
		g.innerHTML = '';
		var ns = 'http://www.w3.org/2000/svg';
		for (var v = 0; v <= maxVal; v += step) {
			var ratio = v / maxVal;
			var angle = Math.PI + ratio * Math.PI;
			var cos = Math.cos(angle), sin = Math.sin(angle);
			var isMajor = (v % (step * 2) === 0) || v === 0 || v === maxVal;
			var outerR = R + 2, innerR = isMajor ? R - 10 : R - 6;
			var line = document.createElementNS(ns, 'line');
			line.setAttribute('x1', CX + cos * innerR);
			line.setAttribute('y1', CY + sin * innerR);
			line.setAttribute('x2', CX + cos * outerR);
			line.setAttribute('y2', CY + sin * outerR);
			if (isMajor) line.setAttribute('class', 'fp-tick-major');
			g.appendChild(line);
			if (isMajor) {
				var txt = document.createElementNS(ns, 'text');
				txt.setAttribute('x', CX + cos * (innerR - 10));
				txt.setAttribute('y', CY + sin * (innerR - 10) + 3);
				txt.textContent = v >= 1000 ? (v / 1000) + 'k' : String(v);
				g.appendChild(txt);
			}
		}
	}

	function setGauge(fillId, needleId, ratio) {
		var el = document.getElementById(fillId);
		var needle = document.getElementById(needleId);
		var r = Math.max(0, Math.min(1, ratio));
		if (el) el.style.strokeDashoffset = String(ARC_LEN - ARC_LEN * r);
		if (needle) {
			var deg = -90 + 180 * r;
			needle.setAttribute('transform', 'rotate(' + deg + ',' + CX + ',' + CY + ')');
		}
	}

	function loadOpsData() {
		buildTicks('fp-ticks-files', 1000, 100);
		buildTicks('fp-ticks-size', 10240, 1024);
		buildTicks('fp-ticks-today', 50, 5);

		fetch('/api/files?limit=1')
			.then(function (r) { return r.json(); })
			.then(function (res) {
				if (!res || !res.success) throw new Error((res && res.error) || '파일 조회 실패');
				var total = res.total || 0;
				var sizeMB = res.storage_mb || 0;
				var todayUploads = res.today_upload_count || 0;
				qs('fp-total-files').textContent = String(total);
				qs('fp-total-size').textContent = sizeMB + ' MB';
				qs('fp-today-uploads').textContent = String(todayUploads);
				setGauge('fp-gauge-files', 'fp-needle-files', Math.min(total / 1000, 1));
				setGauge('fp-gauge-size', 'fp-needle-size', Math.min(sizeMB / 10240, 1));
				setGauge('fp-gauge-today', 'fp-needle-today', Math.min(todayUploads / 50, 1));
			})
			.catch(function (err) {
				setStatus(err && err.message ? err.message : '운영 데이터 조회 실패', false);
			});
	}

	function cleanupOrphans() {
		fetch('/api/files/orphans/cleanup', { method: 'POST' })
			.then(function (r) { return r.json(); })
			.then(function (res) {
				if (!res || !res.success) throw new Error((res && res.error) || '고아 파일 정리 실패');
				setStatus('고아 파일 ' + (res.cleaned || 0) + '건을 정리했습니다.', true);
				loadOpsData();
			})
			.catch(function (err) {
				setStatus(err && err.message ? err.message : '고아 파일 정리 실패', false);
			});
	}

	document.addEventListener('DOMContentLoaded', function () {
		var saveBtns = document.querySelectorAll('[data-fp-save]');
		for (var i = 0; i < saveBtns.length; i++) {
			saveBtns[i].addEventListener('click', savePolicy);
		}
		fetchPolicy().then(loadOpsData).catch(function (err) {
			setStatus(err && err.message ? err.message : '초기화 실패', false);
		});
	});
})();
