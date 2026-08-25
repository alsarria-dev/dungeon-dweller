/**
 * Dungeon Dweller - main menu.
 *
 * Drives index.html only, and is entirely independent of the game: it does not
 * load elements.js, does not touch the `DD` global, and shares no state with a
 * run. Navigation to the game is a plain hyperlink in the markup, so this file
 * never needs to start anything.
 *
 * Its whole job is: start the menu music once the browser will allow it, and
 * toggle the instructions panel.
 *
 * Exports nothing - it is an IIFE that wires up listeners on load.
 */
(() => {
    "use strict";

    // Element lookups; ids must match index.html.
    const introAudio = document.querySelector("#intro_audio");
    const boxAudio = document.querySelector("#openBoxAudio");
    const menu = document.querySelector("#options");
    const instructionsButton = document.querySelector("#instructions");
    const panel = document.querySelector("#instructions-panel");
    const closeButton = document.querySelector("#closeInstructions");
    const startLink = document.querySelector("#startGame");

    /**
     * Play a one-shot sound from the start, ignoring autoplay rejections.
     *
     * @param {HTMLAudioElement|null} track - safe to pass a missing element.
     */
    function play(track) {
        if (!track) return;
        track.currentTime = 0;
        // Rejected until the browser has seen a user gesture; that is expected.
        const played = track.play();
        if (played) played.catch(() => { });
    }

    // Browsers block autoplay until the first real interaction, so listen once
    // rather than re-calling play() on every mouseover as the old build did.
    //
    // Both listeners use { once: true }, so whichever interaction happens first
    // starts the music and removes itself; the other is spent harmlessly later.
    const startMusic = () => {
        introAudio.loop = true;
        const played = introAudio.play();
        if (played) played.catch(() => { });
    };
    document.addEventListener("pointerdown", startMusic, { once: true });
    document.addEventListener("keydown", startMusic, { once: true });

    /**
     * Show or hide the instructions panel.
     *
     * The panel and the menu are mutually exclusive - hiding the menu outright
     * (rather than layering the panel over it) keeps the hidden items out of the
     * tab order while the dialog is open. Focus is moved to whichever side is now
     * visible so keyboard users are not left on a hidden control.
     *
     * @param {boolean} open - true to show the panel, false to return to the menu.
     */
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

    // Escape closes the panel, as expected of a modal dialog.
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && !panel.hidden) setPanelOpen(false);
    });
})();
