// Background music: quiet, looping, a switch and a volume slider. Browsers only allow sound after
// the visitor touches the page, so it starts on the first tap, click or key, never on load.
// It plays through Web Audio so the volume and the fades also work on iPhones (Safari ignores a
// page's volume setting on a plain audio element). Choices stay in this browser (no cookies).
(() => {
  const KEY = "elsewhere-music";          // "off" once the visitor turns it off
  const VOL = "elsewhere-music-volume";   // 0-100, from the slider
  const AT = "elsewhere-music-at";        // where it was, so the next page carries on
  const LOUDEST = 0.6;                    // the slider's top, as a gain: it's background music
  let wanted = localStorage.getItem(KEY) !== "off";
  let level = Number(localStorage.getItem(VOL) ?? 60);
  if (!(level >= 0 && level <= 100)) level = 60;
  let held = false;                        // a video or the checkout has the sound
  let ctx = null, gain = null, stopTimer = 0;

  const audio = new Audio();
  audio.src = "/audio/ambient.m4a";
  audio.loop = true;
  audio.preload = "none";
  audio.addEventListener("loadedmetadata", () => {
    const at = Number(sessionStorage.getItem(AT));
    if (at > 0 && at < audio.duration) audio.currentTime = at;
  }, { once: true });

  const box = document.createElement("div");
  box.className = "music";
  box.setAttribute("role", "group");
  box.setAttribute("aria-label", "Background music");
  box.innerHTML = '<button type="button" class="music-toggle"><span class="bars" aria-hidden="true"><i></i><i></i><i></i></span>'
    + '<span class="say"></span></button>'
    + '<input class="music-volume" type="range" min="0" max="100" step="1" aria-label="Music volume">';
  document.body.appendChild(box);
  const toggle = box.querySelector(".music-toggle");
  const slider = box.querySelector(".music-volume");
  slider.value = String(level);

  const graph = () => {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    gain = ctx.createGain();
    gain.gain.value = 0;
    ctx.createMediaElementSource(audio).connect(gain).connect(ctx.destination);
  };
  const ramp = (to, seconds) => {
    if (!gain) { audio.volume = Math.min(1, to); return; }
    const now = ctx.currentTime;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(gain.gain.value, now);
    gain.gain.linearRampToValueAtTime(to, now + seconds);
  };
  const target = () => (level / 100) * LOUDEST;
  const render = () => {
    const on = !audio.paused;
    box.classList.toggle("on", on);
    toggle.setAttribute("aria-pressed", String(on));
    toggle.setAttribute("aria-label", on ? "Turn the music off" : "Turn the music on");
    toggle.querySelector(".say").textContent = on ? "Music on" : "Music off";
  };
  const play = () => {
    if (!wanted || held || document.hidden) return;
    clearTimeout(stopTimer);
    graph();
    if (ctx && ctx.state === "suspended") ctx.resume();
    audio.play().then(() => { ramp(target(), 2.5); render(); }).catch(render);
  };
  const pause = (now) => {
    clearTimeout(stopTimer);
    if (now) { audio.pause(); if (gain) gain.gain.value = 0; render(); return; }
    ramp(0, 0.5);
    stopTimer = setTimeout(() => { audio.pause(); render(); }, 550);
  };

  const first = (event) => {
    if (event.target.closest && event.target.closest(".music")) return;
    removeEventListener("pointerdown", first, true);
    removeEventListener("keydown", first, true);
    play();
  };
  addEventListener("pointerdown", first, true);
  addEventListener("keydown", first, true);

  toggle.addEventListener("click", () => {
    wanted = audio.paused;
    localStorage.setItem(KEY, wanted ? "on" : "off");
    if (wanted) { held = false; play(); } else pause();
  });
  slider.addEventListener("input", () => {
    level = Number(slider.value);
    localStorage.setItem(VOL, String(level));
    if (!audio.paused) ramp(target(), 0.08);
  });
  // Videos and the checkout bring their own sound.
  document.addEventListener("play", (e) => { if (e.target.tagName === "VIDEO") { held = true; pause(); } }, true);
  document.addEventListener("pause", (e) => { if (e.target.tagName === "VIDEO") { held = false; play(); } }, true);
  document.addEventListener("click", (e) => {
    if (e.target.closest && e.target.closest("[data-polar-checkout]")) { held = true; pause(); }
  }, true);
  document.addEventListener("visibilitychange", () => (document.hidden ? pause(true) : play()));
  addEventListener("pagehide", () => sessionStorage.setItem(AT, String(audio.currentTime || 0)));
  render();
})();
