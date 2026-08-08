import type { CSSProperties } from "react";

/**
 * How much smaller the walkthrough's panels render than they were drawn.
 *
 * Each locked section is exactly one viewport tall above 1024px, and the panels were sized against
 * a tall desktop screen. On a 13-inch laptop — around 764 CSS pixels of viewport after the browser
 * chrome — the workspace ran 856 pixels tall and the calendar, team and floor-plan panels cleared
 * their gutters by a few pixels or not at all. The rooms were full before the reader arrived.
 *
 * `zoom` rather than `transform: scale()`, and that distinction is the whole point: `zoom` reflows,
 * so the panel's layout, its hit targets, its inner scrollers and the containment guard all agree
 * about where things are. A transform would paint the panel smaller while leaving a full-size box
 * behind it, and every click would land in the wrong place. Each panel sits in a centring flex
 * parent, which re-centres it once it has shrunk.
 *
 * The plates are deliberately untouched: they are the photograph of the room, and shrinking the
 * room to fit the furniture is backwards.
 */
export const WALKTHROUGH_PANEL_SCALE = 0.85;

/** Spread onto a section panel's root element. */
export const WALKTHROUGH_PANEL_ZOOM: CSSProperties = { zoom: WALKTHROUGH_PANEL_SCALE };
