(() => {
  const ua = navigator.userAgent || "";
  const platform = navigator.platform || "";
  const maxTouchPoints = navigator.maxTouchPoints || 0;

  const mobileUA = /Android.*Mobile|webOS|iPhone|iPod|BlackBerry|IEMobile|Opera Mini|Mobile Safari/i.test(ua);
  const tabletUA = /iPad|Tablet|PlayBook|Silk/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua));
  const ipadOS = platform === "MacIntel" && maxTouchPoints > 1;
  const touchLikely = maxTouchPoints > 1 && matchMedia("(pointer: coarse)").matches;

  const device = (mobileUA || tabletUA || ipadOS || touchLikely) ? "mobile" : "desktop";
  const form = (mobileUA || (touchLikely && innerWidth <= 760)) ? "phone" : (tabletUA || ipadOS ? "tablet" : "desktop");

  document.documentElement.dataset.device = device;
  document.documentElement.dataset.form = form;
  document.documentElement.classList.toggle("is-mobile-device", device === "mobile");
  document.documentElement.classList.toggle("is-desktop-device", device === "desktop");

  const setViewport = () => {
    document.documentElement.dataset.viewport =
      innerWidth <= 720 ? "compact" :
      innerWidth <= 1120 ? "medium" :
      "wide";
  };

  setViewport();
  addEventListener("resize", setViewport, { passive: true });
})();
