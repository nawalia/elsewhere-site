// Background music: quiet, looping, and one tap to stop. Browsers only allow sound after the
// visitor touches the page, so it starts on the first tap, click or key, never on load.
// The choice to turn it off is kept in this browser only (no cookies).
(() => {
  const KEY = "elsewhere-music";       // "off" once the visitor turns it off
  const AT = "elsewhere-music-at";     // where it was, so the next page carries on
  const VOL = 0.32;
  let wanted = localStorage.getItem(KEY) !== "off";
  let held = false;                     // a video or the checkout has the sound
  let raf = 0;
  const audio = new Audio();
  audio.src = "/audio/ambient.m4a";
  audio.loop = true;
  audio.preload = "none";
  audio.volume = 0;
  audio.addEventListener("loadedmetadata", () => {
    const at = Number(sessionStorage.getItem(AT));
    if (at > 0 && at < audio.duration) audio.currentTime = at;
  }, { once: true });

  const button = document.createElement("button");
  button.type = "button";
  button.className = "music";
  button.innerHTML = '<span class="bars" aria-hidden="true"><i></i><i></i><i></i></span><span class="say"></span>';
  document.body.appendChild(button);

  const render = () => {
    const on = !audio.paused;
    button.classList.toggle("on", on);
    button.setAttribute("aria-pressed", String(on));
    button.setAttribute("aria-label", on ? "Turn the music off" : "Turn the music on");
    button.querySelector(".say").textContent = on ? "Music on" : "Music off";
  };
  const fade = (to, ms, then) => {
    cancelAnimationFrame(raf);
    const from = audio.volume, start = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - start) / ms);
      audio.volume = from + (to - from) * p;
      if (p < 1) raf = requestAnimationFrame(step); else if (then) then();
    };
    raf = requestAnimationFrame(step);
  };
  const play = () => {
    if (!wanted || held || document.hidden) return;
    audio.play().then(() => { fade(VOL, 2500); render(); }).catch(render);
  };
  const pause = (now) => {
    if (now) { cancelAnimationFrame(raf); audio.pause(); audio.volume = 0; render(); return; }
    fade(0, 500, () => { audio.pause(); render(); });
  };

  const first = (event) => {
    if (event.target.closest && event.target.closest(".music")) return;
    removeEventListener("pointerdown", first, true);
    removeEventListener("keydown", first, true);
    play();
  };
  addEventListener("pointerdown", first, true);
  addEventListener("keydown", first, true);

  button.addEventListener("click", () => {
    wanted = audio.paused;
    localStorage.setItem(KEY, wanted ? "on" : "off");
    if (wanted) { held = false; play(); } else pause();
  });
  // Videos and the checkout bring their own sound.
  document.addEventListener("play", (e) => { if (e.target.tagName === "VIDEO") { held = true; pause(); } }, true);
  document.addEventListener("pause", (e) => { if (e.target.tagName === "VIDEO") { held = false; play(); } }, true);
  document.addEventListener("click", (e) => {
    if (e.target.closest && e.target.closest("[data-polar-checkout]")) { held = true; pause(); }
  }, true);
  // A hidden tab doesn't run fades, so stop at once; carry on when it comes back.
  document.addEventListener("visibilitychange", () => (document.hidden ? pause(true) : play()));
  addEventListener("pagehide", () => sessionStorage.setItem(AT, String(audio.currentTime || 0)));
  render();
})();
