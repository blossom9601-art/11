(function(){
  function syncHeight(){
    const page = document.body.classList.contains('project-details-page');
    if(!page) return;
    const leftCard = document.querySelector('.project-details-page #project-main');
    const rightCard = document.getElementById('project-progress');
    if(!leftCard || !rightCard) return;
    const target = leftCard.getBoundingClientRect().height;
    if(target > 0){
      rightCard.style.minHeight = target + 'px';
      rightCard.classList.add('synced-height');
    }
  }
  const ro = new ResizeObserver(()=>{ requestAnimationFrame(syncHeight); });
  window.addEventListener('DOMContentLoaded', ()=>{
    syncHeight();
    const leftCard = document.querySelector('.project-details-page #project-main');
    if(leftCard) ro.observe(leftCard);
  });
  window.addEventListener('resize', ()=>{ requestAnimationFrame(syncHeight); });
})();
