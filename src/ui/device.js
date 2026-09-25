/**
 * Is this a phone or tablet (a finger, not a mouse, is the main pointer)?
 * `?touch=1` in the URL forces the touch controls on, for testing on a desktop.
 */
const forced = new URLSearchParams(window.location.search).has('touch')

export const IS_TOUCH = forced || Boolean(window.matchMedia?.('(pointer: coarse)').matches)

// Lets the stylesheet lay the HUD out for thumbs (and hide keyboard key caps).
if (IS_TOUCH) document.documentElement.classList.add('touch')
