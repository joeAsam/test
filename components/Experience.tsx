"use client";

import dynamic from "next/dynamic";
import { memo, useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { dayLabel, dayLong, event, time12, weekRange, weekState } from "@/lib/content";
import { DAY_COLORS, LAST_STOP } from "@/lib/journey";
import { VENUES } from "@/lib/venues";
import { INTRO_SECONDS, world } from "@/lib/world";
import { Logo } from "./Logo";

// Memoised: the scene only depends on a stable callback, so page state changes never touch it.
const Scene = memo(dynamic(() => import("./scene/Scene"), { ssr: false }));

type Phase = "landing" | "intro" | "journey";

const STOPS = [
  { id: "top", label: "Eket" },
  ...event.days.map((d) => ({ id: `day-${d.day}`, label: d.title })),
  { id: "rsvp", label: "RSVP" },
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

const smooth = (x: number, a: number, b: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
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

export function Experience() {
  const [phase, setPhase] = useState<Phase>("landing");
  const [ready, setReady] = useState(false);
  const [heroIn, setHeroIn] = useState(false);
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState<number | null>(null);
  const sections = useRef<(HTMLElement | null)[]>([]);
  const cards = useRef<(HTMLElement | null)[]>([]);

  const goTo = useCallback((index: number) => {
    sections.current[index]?.scrollIntoView({ behavior: world.reduced ? "auto" : "smooth", block: "center" });
  }, []);

  // First load: honour reduced motion and the ?at= / ?skip shortcuts by skipping the intro.
  useEffect(() => {
    world.reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    history.scrollRestoration = "manual";
    const params = new URLSearchParams(location.search);
    const at = params.get("at");
    const target = at ? STOPS.findIndex((s) => s.id === at || s.id.replace("-", "") === at) : -1;
    if (world.reduced || params.has("skip") || target >= 0) {
      world.journey = true;
      setHeroIn(true);
      setPhase("journey");
      if (target > 0) requestAnimationFrame(() => sections.current[target]?.scrollIntoView({ block: "center" }));
    } else {
      window.scrollTo(0, 0);
    }
  }, []);

  // The page cannot scroll until the intro has handed over to the journey.
  useEffect(() => {
    document.documentElement.classList.toggle("is-locked", phase !== "journey");
    return () => document.documentElement.classList.remove("is-locked");
  }, [phase]);

  // Scroll position → which stop the camera should be at, and how visible each card is.
  useEffect(() => {
    let centres: number[] = [];
    let frame = 0;
    const update = () => {
      frame = 0;
      const mid = window.scrollY + window.innerHeight / 2;
      let stop = 0;
      if (mid >= centres[LAST_STOP]) stop = LAST_STOP;
      else if (mid > centres[0]) {
        const i = centres.findIndex((c, k) => mid >= c && mid < centres[k + 1]);
        stop = i + (mid - centres[i]) / (centres[i + 1] - centres[i]);
      }
      world.stop = stop;
      cards.current.forEach((card, i) => {
        if (!card) return;
        const d = stop - i;
        const o = 1 - smooth(Math.abs(d), 0.2, 0.46);
        card.style.opacity = o.toFixed(3);
        card.style.transform = `translate3d(0, ${(-d * 40).toFixed(1)}px, 0)`;
        card.style.visibility = o < 0.01 ? "hidden" : "visible";
        card.style.pointerEvents = o > 0.6 ? "auto" : "none";
      });
      setActive(Math.round(stop));
    };
    const measure = () => {
      centres = sections.current.map((el) => (el ? el.offsetTop + el.offsetHeight / 2 : 0));
      update();
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", measure);
    const observer = new ResizeObserver(measure);
    sections.current.forEach((el) => el && observer.observe(el));
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", measure);
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      world.pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
      world.pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, []);

  const showTitle = useCallback(() => setHeroIn(true), []);
  const startJourney = useCallback(() => setPhase("journey"), []);

  const skip = () => {
    world.journey = true;
    setHeroIn(true);
    setPhase("journey");
  };

  const onReady = useCallback(() => setReady(true), []);
  const year = `’${String(event.year).slice(2)}`;

  return (
    <div className="xp" data-phase={phase} data-hero={heroIn} data-ready={ready}>
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
        <button type="button" className="btn btn--light btn--small" onClick={() => goTo(LAST_STOP)}>
          RSVP
        </button>
      </header>

      <nav className="rail" aria-label="Days">
        {STOPS.map((s, i) => (
          <button
            key={s.id}
            type="button"
            className="rail__stop"
            style={{ "--day": i >= 1 && i <= 5 ? DAY_COLORS[i - 1] : "#ffffff" } as CSSProperties}
            aria-current={active === i ? "step" : undefined}
            aria-label={i >= 1 && i <= 5 ? `Day ${i}: ${s.label}` : s.label}
            onClick={() => goTo(i)}
          >
            <span>{i >= 1 && i <= 5 ? `${day2(i)} ${s.label}` : s.label}</span>
          </button>
        ))}
      </nav>

      <main className="stops" inert={!heroIn}>
        <section
          id="top"
          className="stop stop--hero"
          ref={(el) => {
            sections.current[0] = el;
          }}
        >
          <div className="stop__pin">
            <div
              className="hero"
              ref={(el) => {
                cards.current[0] = el;
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
              <button type="button" className="hero__scroll" onClick={() => goTo(1)}>
                Scroll to fly to Day 1 <span aria-hidden="true">↓</span>
              </button>
            </div>
          </div>
        </section>

        {event.days.map((d, i) => {
          const venue = VENUES[d.venue];
          const next = event.days[i + 1];
          const expanded = open === i;
          return (
            <section
              key={d.day}
              id={`day-${d.day}`}
              className="stop"
              style={{ "--day": DAY_COLORS[i] } as CSSProperties}
              ref={(el) => {
                sections.current[i + 1] = el;
              }}
            >
              <div className="stop__pin">
                <article
                  className="card"
                  data-open={expanded}
                  ref={(el) => {
                    cards.current[i + 1] = el;
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
              </div>
            </section>
          );
        })}

        <section
          id="rsvp"
          className="stop stop--finale"
          ref={(el) => {
            sections.current[LAST_STOP] = el;
          }}
        >
          <div className="stop__pin">
            <div
              className="finale"
              ref={(el) => {
                cards.current[LAST_STOP] = el;
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
          </div>
        </section>
      </main>

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
