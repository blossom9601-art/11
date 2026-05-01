/* Blossom Chat - Mobile DOM polish */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };

  function text(id, value) {
    var el = $(id);
    if (el) el.textContent = value;
  }

  function attr(id, name, value) {
    var el = $(id);
    if (el) el.setAttribute(name, value);
  }

  function replaceTextNodes(el, value) {
    if (!el) return;
    Array.prototype.slice.call(el.childNodes).forEach(function (node) {
      if (node.nodeType === 3) node.nodeValue = '';
    });
    el.appendChild(document.createTextNode(value));
  }

  function labelInput(labelId, labelText, inputId, placeholder) {
    var label = $(labelId);
    var input = $(inputId);
    if (!label || !input) return;
    Array.prototype.slice.call(label.childNodes).forEach(function (node) {
      if (node.nodeType === 3) node.nodeValue = '';
    });
    label.insertBefore(document.createTextNode(labelText), input);
    if (placeholder) input.placeholder = placeholder;
  }

  function fixStaticText() {
    var active = document.body.dataset.mTab || 'chat';
    text('wsTitle', active === 'people' ? '동료' : '채팅');
    text('convTitle', '대화를 선택하세요');
    text('pinnedBarText', '고정된 메시지');
    text('calNewBtn', '+ 일정 추가');
    text('calNavToday', '오늘');
    text('memoNewBtn', '+ 새 메모');

    attr('chatSearch', 'placeholder', '채널 또는 메시지 검색');
    attr('peopleSearch', 'placeholder', '이름, 사번, 부서 검색');
    attr('composerInput', 'placeholder', '메시지 보내기');
    attr('btnAddDm', 'title', '새 메시지');
    attr('btnAddDm', 'aria-label', '새 메시지');
    attr('btnNewChannel', 'title', '채널 만들기');
    attr('btnNewChannel', 'aria-label', '채널 만들기');
    attr('btnAddChannel', 'title', '채널 추가');
    attr('btnAddChannel', 'aria-label', '채널 추가');

    labelInput('loginEmpNoLabel', '사번', 'loginEmpNo', '사번을 입력하세요');
    labelInput('loginPasswordLabel', '비밀번호', 'loginPassword', '비밀번호');
  }

  function fixSectionTitles() {
    replaceTextNodes(document.querySelector('[data-target="channelList"]'), '채널');
    replaceTextNodes(document.querySelector('[data-target="dmList"]'), '다이렉트 메시지');
  }

  function fixSettingsLabels() {
    var labels = {
      general: '일반',
      notify: '알림',
      display: '화면',
      security: '보안',
      retention: '자동 삭제',
      connection: '연결',
      data: '데이터',
      about: '정보'
    };
    Object.keys(labels).forEach(function (key) {
      var btn = document.querySelector('.settings-tab[data-settings-tab="' + key + '"]');
      if (!btn) return;
      btn.title = labels[key];
      var span = btn.querySelector('.settings-tab-txt');
      if (span) span.textContent = labels[key];
    });
    var title = document.querySelector('.settings-nav-title');
    if (title) title.textContent = '설정';
  }

  function normalizePeopleItem(li) {
    if (!li || li.dataset.mobilePeopleReady === '1') return;
    li.dataset.mobilePeopleReady = '1';
    if (li.classList.contains('people-group')) return;

    var name = li.querySelector('.name, .people-name, strong');
    var meta = li.querySelector('.meta, .people-meta, small');
    var avatar = li.querySelector('.avatar, .people-avatar');

    if (!avatar) {
      avatar = document.createElement('span');
      avatar.className = 'avatar avatar-sm';
      var raw = (name ? name.textContent : li.textContent || '').trim();
      avatar.textContent = raw ? raw.slice(0, 1) : 'B';
      li.insertBefore(avatar, li.firstChild);
    }

    if (!name) {
      var textValue = (li.textContent || '').replace(/\s+/g, ' ').trim();
      var info = document.createElement('span');
      info.className = 'info';
      name = document.createElement('span');
      name.className = 'name';
      name.textContent = textValue || '동료';
      meta = document.createElement('span');
      meta.className = 'meta';
      meta.textContent = '사번 · 팀 정보';
      info.appendChild(name);
      info.appendChild(meta);
      Array.prototype.slice.call(li.childNodes).forEach(function (node) {
        if (node !== avatar) li.removeChild(node);
      });
      li.appendChild(info);
    }
  }

  function polishPeopleList() {
    var list = $('peopleList');
    if (!list) return;
    Array.prototype.forEach.call(list.querySelectorAll('li'), normalizePeopleItem);
    if (!list.children.length) {
      var empty = document.createElement('li');
      empty.className = 'people-empty m-empty-state';
      empty.innerHTML = '<strong>표시할 동료가 없습니다</strong><span>동료 정보가 동기화되면 아바타, 이름, 사번, 팀이 표시됩니다.</span>';
      list.appendChild(empty);
    }
  }

  function observeLists() {
    ['channelList', 'dmList', 'peopleList'].forEach(function (id) {
      var el = $(id);
      if (!el) return;
      new MutationObserver(function () {
        if (id === 'peopleList') polishPeopleList();
      }).observe(el, { childList: true, subtree: true });
    });
  }

  function run() {
    fixStaticText();
    fixSectionTitles();
    fixSettingsLabels();
    polishPeopleList();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      run();
      observeLists();
    });
  } else {
    run();
    observeLists();
  }

  setInterval(run, 1200);
})();
