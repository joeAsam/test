"use client";

import dynamic from "next/dynamic";
import { memo, useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { dayLabel, dayLong, event, time12, weekRange, weekState } from "@/lib/content";
import { DAY_COLORS, LAST_STOP } from "@/lib/journey";
import { VENUES } from "@/lib/venues";
import { INTRO_SECONDS, ORBIT_PITCH, world } from "@/lib/world";
import { Logo } from "./Logo";

// Memoised: the scene only depends on a stable callback, so page state changes never touch it.
const Scene = memo(dynamic(() => import("./scene/Scene"), { ssr: false }));

type Phase = "landing" | "intro" | "journey";

/** Every stop of the journey, in order. `nav` is its name in the navbar. */
const STOPS = [
  { id: "home", nav: "Home", short: "Home", title: event.city },
  ...event.days.map((d) => ({ id: `day${d.day}`, nav: `Day ${d.day}`, short: String(d.day), title: d.title })),
  { id: "rsvp", nav: "RSVP", short: "RSVP", title: "RSVP" },
];

/** The RSVP link in lib/content.ts is a placeholder until it points at a real form. */
const rsvpReady = !event.rsvpUrl.startsWith("#");

/** Intro captions, timed against the light spreading through the streets (seconds, text). */
const CAPTIONS: { at: number; until: number; lines: string[] }[] = [
  { at: 1, until: 4.1, lines: ["From wherever you are,", "your voice belongs here"] },
  { at: 4.3, until: 6, lines: [`in ${event.city}, ${event.state}.`] },
];
const VERBS_AT = 6.1;
const VERB_GAP = 0.55;
const TITLE_AT = 8.9;

/** After one scroll or swipe moves a stop, further input is ignored for this long (ms). */
const STEP_LOCK = 950;

const day2 = (n: number) => String(n).padStart(2, "0");

function Countdown() {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => tick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, []);
  const s = weekState();
  if (s.kind === "ended") return <p className="chip">Thank you for a wonderful week</p>;
  if (s.kind === "live") return <p className="chip chip--live">Happening now · Day {s.day.day}</p>;
  return (
    <p className="chip" suppressHydrationWarning>
      {s.kind === "before" ? "Starts in" : `Day ${s.day.day} in`}{" "}
      <b suppressHydrationWarning>
        {s.days}d {day2(s.hours)}h {day2(s.minutes)}m {day2(s.seconds)}s
      </b>
    </p>
  );
}

/**
 * Intro captions. They keep their own clock state so that ticking it never re-renders
 * the page around them (and with it the 3D scene).
 */
function IntroCaptions({ onTitle, onDone, onSkip }: { onTitle: () => void; onDone: () => void; onSkip: () => void }) {
  const [beat, setBeat] = useState(0);
  useEffect(() => {
    world.introT = 0;
    let titled = false;
    // Captions follow the scene's own clock, so they stay in step even if frames run slow.
    const clock = window.setInterval(() => {
      setBeat(world.introT);
      if (!titled && world.introT >= TITLE_AT) {
        titled = true;
        onTitle();
      }
      if (world.journey) onDone();
    }, 100);
    // If the tab is hidden the scene stops; never leave the visitor locked in the intro.
    const rescue = window.setTimeout(() => {
      world.journey = true;
      onTitle();
      onDone();
    }, (INTRO_SECONDS + 12) * 1000);
    return () => {
      window.clearInterval(clock);
      window.clearTimeout(rescue);
    };
  }, [onTitle, onDone]);
  return (
    <div className="captions" aria-live="polite">
      {CAPTIONS.map((c) => (
        <p key={c.at} className="captions__line" data-on={beat >= c.at && beat < c.until}>
          {c.lines.map((line) => (
            <span key={line}>{line}</span>
          ))}
        </p>
      ))}
      <p className="captions__verbs" data-on={beat >= VERBS_AT && beat < TITLE_AT}>
        {event.days.map((d, i) => (
          <span key={d.day} data-on={beat >= VERBS_AT + i * VERB_GAP} style={{ "--day": DAY_COLORS[i] } as CSSProperties}>
            {d.verb}
          </span>
        ))}
      </p>
      <button type="button" className="captions__skip" onClick={onSkip}>
        Skip
      </button>
    </div>
  );
}

/** True when the event started on something the visitor can operate or read by scrolling. */
const onControl = (target: EventTarget | null) => target instanceof Element && !!target.closest("a, button, .card, .landing");

export function Experience() {
  const [phase, setPhase] = useState<Phase>("landing");
  const [ready, setReady] = useState(false);
  const [heroIn, setHeroIn] = useState(false);
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState<number | null>(null);
  const [grabbing, setGrabbing] = useState(false);
  const at = useRef(0);

  /** Fly to a stop. Everything that navigates goes through here. */
  const goTo = useCallback((index: number, instant = false) => {
    const next = Math.min(LAST_STOP, Math.max(0, index));
    if (next === at.current) return;
    at.current = next;
    world.snap = instant;
    world.target = next;
    setActive(next);
    setOpen(null);
  }, []);

  // First load: honour reduced motion and the ?at= / ?skip shortcuts by skipping the intro.
  useEffect(() => {
    world.reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const params = new URLSearchParams(location.search);
    const asked = (params.get("at") ?? "").replace("-", "");
    const target = STOPS.findIndex((s) => s.id === asked || (asked === "top" && s.id === "home"));
    if (world.reduced || params.has("skip") || target >= 0) {
      world.journey = true;
      setHeroIn(true);
      setPhase("journey");
      if (target > 0) goTo(target, true);
    }
  }, [goTo]);

  // One scroll, swipe or key press moves exactly one stop. On the overview, dragging turns the map.
  useEffect(() => {
    if (phase !== "journey") return;
    let lockedUntil = 0;
    let wheel = 0;
    let wheelAt = 0;
    const step = (dir: number) => {
      const now = performance.now();
      if (now < lockedUntil) return;
      lockedUntil = now + STEP_LOCK;
      goTo(at.current + dir);
    };

    const onWheel = (e: WheelEvent) => {
      // An open card that still has text to scroll keeps the wheel for itself.
      const card = e.target instanceof Element ? e.target.closest<HTMLElement>(".card") : null;
      if (card && card.scrollHeight > card.clientHeight + 1) {
        const atEnd = e.deltaY > 0 ? card.scrollTop + card.clientHeight >= card.scrollHeight - 1 : card.scrollTop <= 0;
        if (!atEnd) return;
      }
      e.preventDefault();
      const now = performance.now();
      // A trackpad sends a long tail of small deltas: gather them, and forget stale ones.
      if (now - wheelAt > 260) wheel = 0;
      wheelAt = now;
      wheel += e.deltaY;
      if (Math.abs(wheel) > 36) {
        step(Math.sign(wheel));
        wheel = 0;
      }
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const typing = e.target instanceof HTMLElement && e.target.closest("input, textarea, select");
      if (typing) return;
      const onButton = e.target instanceof HTMLElement && e.target.closest("a, button");
      if (e.key === "ArrowDown" || e.key === "ArrowRight" || e.key === "PageDown" || (e.key === " " && !onButton)) step(1);
      else if (e.key === "ArrowUp" || e.key === "ArrowLeft" || e.key === "PageUp") step(-1);
      else if (e.key === "Home") goTo(0);
      else if (e.key === "End") goTo(LAST_STOP);
      else return;
      e.preventDefault();
    };

    // Pointer: a drag on the overview turns the map; a vertical swipe anywhere moves a stop.
    let drag: { id: number; x: number; y: number; yaw: number; pitch: number; touch: boolean; turned: boolean } | null = null;
    const onDown = (e: PointerEvent) => {
      if (onControl(e.target) || (e.pointerType === "mouse" && e.button !== 0)) return;
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, yaw: world.orbit.yaw, pitch: world.orbit.pitch, touch: e.pointerType !== "mouse", turned: false };
      if (at.current === 0 && !drag.touch) setGrabbing(true);
    };
    const onMove = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id || at.current !== 0) return;
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      // On touch, only a mostly sideways drag turns the map, so swiping up and down still moves on.
      if (drag.touch && !drag.turned && Math.abs(dx) < Math.abs(dy) * 1.2) return;
      if (Math.abs(dx) + Math.abs(dy) > 6) drag.turned = true;
      world.orbit.yaw = drag.yaw - dx * 0.0045;
      if (!drag.touch) world.orbit.pitch = Math.min(ORBIT_PITCH[1], Math.max(ORBIT_PITCH[0], drag.pitch + dy * 0.003));
    };
    const onUp = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      const dy = e.clientY - drag.y;
      const dx = e.clientX - drag.x;
      if (drag.touch && !drag.turned && Math.abs(dy) > 46 && Math.abs(dy) > Math.abs(dx) * 1.2) step(dy < 0 ? 1 : -1);
      drag = null;
      setGrabbing(false);
    };

    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [phase, goTo]);

  const showTitle = useCallback(() => setHeroIn(true), []);
  const startJourney = useCallback(() => setPhase("journey"), []);

  const skip = () => {
    world.journey = true;
    setHeroIn(true);
    setPhase("journey");
  };

  const onReady = useCallback(() => setReady(true), []);
  const year = `’${String(event.year).slice(2)}`;
  const accent = active >= 1 && active <= 5 ? DAY_COLORS[active - 1] : "#ffffff";

  return (
    <div className="xp" data-phase={phase} data-hero={heroIn} data-ready={ready} data-home={active === 0} data-grabbing={grabbing}>
      <div className="xp__canvas" aria-hidden="true">
        <Scene onReady={onReady} />
      </div>
      <div className="xp__shade" aria-hidden="true" />

      {/* Map pins, positioned by the scene every frame. */}
      <div className="pins">
        {event.days.map((d, i) => (
          <button
            key={d.day}
            type="button"
            className="pin"
            data-side={i === 0 ? "down" : i === 1 ? "left" : i === 4 ? "up" : "right"}
            style={{ "--day": DAY_COLORS[i] } as CSSProperties}
            ref={(el) => {
              world.pins[i] = el;
            }}
            onClick={() => goTo(i + 1)}
          >
            <i aria-hidden="true" />
            <span>
              <b>
                {day2(d.day)}
                <em> · {d.title}</em>
              </b>
              <small>
                {dayLabel(d.date)} · {VENUES[d.venue].name}
              </small>
            </span>
          </button>
        ))}
      </div>

      <header className="top">
        <button type="button" className="top__brand" onClick={() => goTo(0)} aria-label={`${event.name}: back to the overview`}>
          <Logo size={24} />
          <span>
            {event.name} <em>{year}</em>
          </span>
        </button>

        <nav className="nav" aria-label="Main" style={{ "--day": accent } as CSSProperties}>
          {STOPS.slice(0, LAST_STOP).map((s, i) => (
            <button
              key={s.id}
              type="button"
              className="nav__link"
              style={{ "--day": i >= 1 ? DAY_COLORS[i - 1] : "#ffffff" } as CSSProperties}
              aria-current={active === i ? "page" : undefined}
              title={s.title}
              onClick={() => goTo(i)}
            >
              <span className="nav__long">{s.nav}</span>
              <span className="nav__short" aria-hidden="true">
                {s.short}
              </span>
            </button>
          ))}
        </nav>

        <button type="button" className="btn btn--light btn--small" aria-current={active === LAST_STOP ? "page" : undefined} onClick={() => goTo(LAST_STOP)}>
          RSVP
        </button>
      </header>

      <main className="stops" inert={!heroIn}>
        <section className="stop stop--hero" aria-label="Overview" inert={active !== 0}>
          <div
            className="hero"
            ref={(el) => {
              world.cards[0] = el;
            }}
          >
            <p className="label">
              {event.city} · {event.state} · {event.country}
            </p>
            <h1 className="hero__title">
              {event.name} <em>{year}</em>
            </h1>
            <p className="hero__theme">{event.theme}</p>
            <p className="hero__meta">
              {weekRange()} · {event.days.length} days, {new Set(event.days.map((d) => d.venue)).size} venues
            </p>
            <Countdown />
          </div>
        </section>

        {event.days.map((d, i) => {
          const venue = VENUES[d.venue];
          const next = event.days[i + 1];
          const expanded = open === i;
          return (
            <section key={d.day} className="stop" aria-label={`Day ${d.day}`} style={{ "--day": DAY_COLORS[i] } as CSSProperties} inert={active !== i + 1}>
              <article
                className="card"
                data-open={expanded}
                ref={(el) => {
                  world.cards[i + 1] = el;
                }}
              >
                <p className="label card__kicker">
                  <i aria-hidden="true" />
                  Day {day2(d.day)} · {dayLabel(d.date)}
                </p>
                <h2 className="card__title">{d.title}</h2>
                <p className="card__when">
                  <time dateTime={`${d.date}T${d.start}`}>
                    {dayLong(d.date)} · {time12(d.start)} – {time12(d.end)} WAT
                  </time>
                </p>
                <a className="venue" href={venue.mapUrl} target="_blank" rel="noreferrer">
                  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                    <path d="M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.800 7 12 7 12Z" fill="none" stroke="currentColor" strokeWidth="1.6" />
                    <circle cx="12" cy="10" r="2.4" fill="currentColor" />
                  </svg>
                  <span>
                    <b>{venue.name}</b>
                    <small>{venue.town}</small>
                  </span>
                  <i aria-hidden="true">↗</i>
                  <span className="sr-only">Opens Google Maps in a new tab</span>
                </a>
                <p className="card__blurb">{d.blurb}</p>

                <div className="card__more" id={`more-${d.day}`}>
                  <h3 className="label">What to expect</h3>
                  <ul>
                    {d.expect.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                  <dl className="card__facts">
                    <dt className="label">Dress code</dt>
                    <dd>{d.dress}</dd>
                  </dl>
                  {d.note && <p className="card__note">{d.note}</p>}
                </div>

                <div className="card__actions">
                  <button type="button" className="btn btn--light" onClick={() => goTo(LAST_STOP)}>
                    RSVP
                  </button>
                  <button type="button" className="btn card__toggle" aria-expanded={expanded} aria-controls={`more-${d.day}`} onClick={() => setOpen(expanded ? null : i)}>
                    {expanded ? "Less" : "Details"}
                  </button>
                  <button type="button" className="btn card__next" onClick={() => goTo(i + 2)}>
                    {next ? `Next: ${next.title}` : "Finish"} <span aria-hidden="true">↓</span>
                  </button>
                </div>
              </article>
            </section>
          );
        })}

        <section className="stop stop--finale" aria-label="RSVP" inert={active !== LAST_STOP}>
          <div
            className="finale"
            ref={(el) => {
              world.cards[LAST_STOP] = el;
            }}
          >
            <p className="label">{weekRange()}</p>
            <h2 className="finale__title">See you in {event.city}.</h2>
            <p className="finale__lead">Five days, one choir. Bring your voice.</p>
            {rsvpReady ? (
              <a className="btn btn--light btn--big" href={event.rsvpUrl} target="_blank" rel="noreferrer">
                RSVP now
              </a>
            ) : (
              <p className="chip">RSVP opens soon</p>
            )}
            <ol className="finale__days">
              {event.days.map((d, i) => (
                <li key={d.day} style={{ "--day": DAY_COLORS[i] } as CSSProperties}>
                  <button type="button" onClick={() => goTo(i + 1)}>
                    <i aria-hidden="true" />
                    <span className="label">{day2(d.day)}</span>
                    {d.title}
                  </button>
                </li>
              ))}
            </ol>
          </div>
        </section>
      </main>

      {/* Step arrows: the same one-stop move as a scroll, for anyone who prefers to click. */}
      <div className="steps">
        <button type="button" aria-label="Previous stop" disabled={active === 0} onClick={() => goTo(active - 1)}>
          ↑
        </button>
        <span className="label" aria-hidden="true">
          {day2(active + 1)} / {day2(LAST_STOP + 1)}
        </span>
        <button type="button" aria-label="Next stop" disabled={active === LAST_STOP} onClick={() => goTo(active + 1)}>
          ↓
        </button>
      </div>

      {/* How to move, shown only on the overview. */}
      <p className="hero__hint label" aria-hidden={active !== 0}>
        <span className="hero__hint-drag">Drag to look around</span>
        <button type="button" tabIndex={active === 0 ? 0 : -1} onClick={() => goTo(1)}>
          Scroll for Day 1 <span aria-hidden="true">↓</span>
        </button>
      </p>

      <p className="credit">Map data © OpenStreetMap contributors</p>

      {phase === "intro" && <IntroCaptions onTitle={showTitle} onDone={startJourney} onSkip={skip} />}

      {phase === "landing" && (
        <div className="landing">
          <p className="label">{event.lead}</p>
          <h1 className="landing__question">
            {event.question.split(event.name).map((part, i, all) => (
              <span key={i}>
                {part}
                {i < all.length - 1 && <em>{event.name}</em>}
              </span>
            ))}
          </h1>
          <button type="button" className="btn btn--light btn--big" disabled={!ready} onClick={() => setPhase("intro")}>
            {ready ? "Yes, I’m ready" : "Loading the map…"}
          </button>
          <button type="button" className="landing__skip" onClick={skip}>
            Skip the intro
          </button>
        </div>
      )}
    </div>
  );
}
