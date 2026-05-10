(function () {
  'use strict';

  function mount() {
    var target = document.getElementById('lottie');
    if (!target || !window.lottie) {
      document.body.setAttribute('data-lottie-error', 'loader');
      return;
    }

    try {
      window.lottie.loadAnimation({
        container: target,
        renderer: 'svg',
        loop: true,
        autoplay: true,
        path: '/static/image/svg/free-animated-no-data.json?v=20260509_external_frame',
        rendererSettings: {
          preserveAspectRatio: 'xMidYMid meet'
        }
      });
    } catch (_err) {
      document.body.setAttribute('data-lottie-error', 'mount');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount, { once: true });
  } else {
    mount();
  }
}());
