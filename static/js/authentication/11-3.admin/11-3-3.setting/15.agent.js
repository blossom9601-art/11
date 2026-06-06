(function(){
    'use strict';

    function $(sel){ return document.querySelector(sel); }

    async function fetchJson(url, options){
        var res = await fetch(url, options || { headers:{'Accept':'application/json'} });
        var data = await res.json().catch(function(){ return null; });
        if(!res.ok || !data) throw new Error((data && (data.error || data.message)) || ('HTTP ' + res.status));
        return data;
    }

    function setStatus(text, ok){
        var status = $('#agent-settings-status');
        var badge = $('#agent-settings-badge');
        if(status) status.textContent = text;
        if(badge){
            badge.textContent = ok ? '저장됨' : '확인 필요';
            badge.classList.toggle('active', !!ok);
        }
    }

    function fill(settings){
        Array.prototype.forEach.call(document.querySelectorAll('#agent-settings-form [name]'), function(el){
            var key = el.name;
            if(!(key in settings)) return;
            if(el.type === 'checkbox') el.checked = !!settings[key];
            else el.value = settings[key];
        });
    }

    function collect(){
        var payload = {};
        Array.prototype.forEach.call(document.querySelectorAll('#agent-settings-form [name]'), function(el){
            if(el.type === 'checkbox') payload[el.name] = !!el.checked;
            else payload[el.name] = parseInt(el.value || '0', 10) || 0;
        });
        return payload;
    }

    async function load(){
        var data = await fetchJson('/admin/auth/agent/config');
        fill(data.settings || {});
        setStatus('에이전트 설정을 불러왔습니다.', true);
    }

    async function save(ev){
        ev.preventDefault();
        var form = ev.currentTarget;
        var btn = form.querySelector('button[type="submit"]');
        if(btn) btn.disabled = true;
        try{
            var data = await fetchJson('/admin/auth/agent/config', {
                method:'PUT',
                headers:{'Content-Type':'application/json','Accept':'application/json'},
                body: JSON.stringify(collect())
            });
            fill(data.settings || {});
            setStatus('에이전트 설정을 저장했습니다.', true);
        }catch(err){
            setStatus((err && err.message) ? err.message : '저장에 실패했습니다.', false);
        }finally{
            if(btn) btn.disabled = false;
        }
    }

    function init(){
        var form = $('#agent-settings-form');
        if(!form) return;
        form.addEventListener('submit', save);
        load().catch(function(err){
            setStatus((err && err.message) ? err.message : '설정을 불러오지 못했습니다.', false);
        });
    }

    if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
    else init();
})();
