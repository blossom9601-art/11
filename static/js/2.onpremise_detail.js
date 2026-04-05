// 2.onpremise_detail.js: On-premise Server Detail page behaviors

(function(){
  // Early: apply saved sidebar state to prevent flash
  try {
    document.documentElement.classList.add('sidebar-preload');
    var state = localStorage.getItem('sidebarState');
    var style = document.createElement('style');
    if(state === 'collapsed'){
      style.innerHTML = '.sidebar{width:70px !important} .main-content{margin-left:70px !important}';
    } else if(state === 'hidden'){
      style.innerHTML = '.sidebar{transform:translateX(-100%) !important;width:260px !important} .main-content{margin-left:0 !important}';
    } else {
      style.innerHTML = '';
    }
    document.head.appendChild(style);
  } catch(e) { /* no-op */ }

  window.addEventListener('DOMContentLoaded', function(){
    document.documentElement.classList.remove('sidebar-preload');

    // Wire edit trigger button
    var editBtn = document.querySelector('.server-detail-pane#basic .add-btn-icon');
    if(editBtn){
      editBtn.addEventListener('click', openEditModal);
    }

    // Wire modal buttons
    var closeBtn = document.querySelector('#server-edit-modal .close-btn');
    var prevBtn = document.getElementById('btn-prev-edit');
    var nextBtn = document.getElementById('btn-next-edit');
    var completeBtn = document.getElementById('btn-complete-edit');

    if(closeBtn){ closeBtn.addEventListener('click', closeEditModal); }
    if(prevBtn){ prevBtn.addEventListener('click', prevEditStep); }
    if(nextBtn){ nextBtn.addEventListener('click', nextEditStep); }
    if(completeBtn){ completeBtn.addEventListener('click', completeServerEdit); }
  });

  // Modal and step control
  var currentStep = 1;
  var totalSteps = 4;

  function qs(sel){ return document.querySelector(sel); }
  function qsa(sel){ return Array.prototype.slice.call(document.querySelectorAll(sel)); }

  function openEditModal(){
    currentStep = 1;
    updateSteps();
    var modal = qs('#server-edit-modal');
    if(modal){
      modal.classList.add('show');
      document.body.classList.add('modal-open');
    }
  }

  function closeEditModal(){
    var modal = qs('#server-edit-modal');
    if(modal){
      modal.classList.remove('show');
      document.body.classList.remove('modal-open');
    }
  }

  function updateSteps(){
    // Toggle active step panes
    qsa('.edit-step').forEach(function(stepEl){
      var step = parseInt(stepEl.getAttribute('data-step'), 10);
      if(step === currentStep){ stepEl.classList.add('active'); }
      else { stepEl.classList.remove('active'); }
    });

    // Update buttons
    var prevBtn = document.getElementById('btn-prev-edit');
    var nextBtn = document.getElementById('btn-next-edit');
    var completeBtn = document.getElementById('btn-complete-edit');

    if(prevBtn){ prevBtn.disabled = currentStep === 1; }
    if(nextBtn){ nextBtn.style.display = currentStep === totalSteps ? 'none' : 'inline-block'; }
    if(completeBtn){ completeBtn.style.display = currentStep === totalSteps ? 'inline-block' : 'none'; }
  }

  function nextEditStep(){
    if(currentStep < totalSteps){
      currentStep += 1;
      updateSteps();
    }
  }

  function prevEditStep(){
    if(currentStep > 1){
      currentStep -= 1;
      updateSteps();
    }
  }

  function completeServerEdit(){
    // Placeholder for validation + save
    // For now we simply close the modal after a quick state check
    closeEditModal();
  }

  // Expose minimal API if other scripts rely on these names
  window.editBasicInfo = openEditModal;
  window.closeServerEditModal = closeEditModal;
  window.nextEditStep = nextEditStep;
  window.prevEditStep = prevEditStep;
  window.completeServerEdit = completeServerEdit;
})();
