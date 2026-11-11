import { SITES } from "./journey";

export type Quality = "low" | "medium" | "high";

/**
 * Per-frame state shared by the page and the 3D scene. It is a plain mutable object on
 * purpose: the render loop reads and writes it every frame without re-rendering React.
 */
export const world = {
  /** Stop the scroll position asks for (0 = overview … 6 = finale), fractional mid-flight. */
  stop: 0,
  /** The same value after smoothing; the camera follows this one. */
  stopSmooth: 0,
  /** Seconds since the visitor said yes. Negative while the landing question is up. */
  introT: -1,
  /** True once the intro is over (or was skipped) and scrolling drives the camera. */
  journey: false,
  /** How far the light has spread along the streets from DE Exchange, in metres. */
  reach: 0,
  /** 0 → 1 as each day's beacon ignites during the intro. */
  beacon: SITES.map(() => 0),
  /** 0 → 1 as each venue comes into focus; drives its lights and beams. */
  focus: SITES.map(() => 0),
  /** 1 on the wide shots (overview and finale), 0 at a venue. */
  wide: 1,
  /** Map pins the scene positions every frame; the page registers the elements. */
  pins: [] as (HTMLElement | null)[],
  /** Pointer position, -1 … 1 on both axes, for a gentle parallax. */
  pointer: { x: 0, y: 0 },
  reduced: false,
  quality: "high" as Quality,
};

/** Length of the intro, in seconds. */
export const INTRO_SECONDS = 10.5;
/** The light has covered the whole map, Ikot Abasi included, by this distance. */
export const FULL_REACH = 11000;

/** ?q=low|medium|high pins the quality level, for testing or for a visitor who wants to choose. */
export function pinnedQuality(): Quality | null {
  const q = new URLSearchParams(location.search).get("q");
  return q === "low" || q === "medium" || q === "high" ? q : null;
}

export function startingQuality(): Quality {
  const pinned = pinnedQuality();
  if (pinned) return pinned;
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
  const coarse = matchMedia("(pointer: coarse)").matches;
  if (mem <= 3) return "low";
  // Four cores or fewer usually means built-in graphics; phones also start in the middle.
  return coarse || navigator.hardwareConcurrency <= 4 ? "medium" : "high";
}
