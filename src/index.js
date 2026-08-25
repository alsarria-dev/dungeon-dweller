/** Dungeon Dweller - main menu. */
(() => {
    "use strict";

    const introAudio = document.querySelector("#intro_audio");
    const boxAudio = document.querySelector("#openBoxAudio");
    const menu = document.querySelector("#options");
    const instructionsButton = document.querySelector("#instructions");
    const panel = document.querySelector("#instructions-panel");
    const closeButton = document.querySelector("#closeInstructions");
    const startLink = document.querySelector("#startGame");

    function play(track) {
        if (!track) return;
        track.currentTime = 0;
        // Rejected until the browser has seen a user gesture; that is expected.
        const played = track.play();
        if (played) played.catch(() => { });
    }

    // Browsers block autoplay until the first real interaction, so listen once
    // rather than re-calling play() on every mouseover as the old build did.
    const startMusic = () => {
        introAudio.loop = true;
        const played = introAudio.play();
        if (played) played.catch(() => { });
    };
    document.addEventListener("pointerdown", startMusic, { once: true });
    document.addEventListener("keydown", startMusic, { once: true });

    function setPanelOpen(open) {
        panel.hidden = !open;
        menu.hidden = open;
        instructionsButton.setAttribute("aria-expanded", String(open));
        play(boxAudio);
        (open ? closeButton : instructionsButton).focus();
    }

    instructionsButton.addEventListener("click", () => setPanelOpen(true));
    closeButton.addEventListener("click", () => setPanelOpen(false));
    startLink.addEventListener("click", () => play(boxAudio));

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && !panel.hidden) setPanelOpen(false);
    });
})();
