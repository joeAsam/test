import type { VenueKey } from "./venues";

/**
 * Event content. Everything here is meant to be edited.
 * ⚠ DATES AND TIMES ARE PLACEHOLDERS (Mon 14 – Fri 18 December 2026) until the programme is confirmed.
 */
export type DayInfo = {
  day: number;
  title: string;
  verb: string; // one word for the journey line
  date: string; // YYYY-MM-DD
  start: string; // HH:MM, local (WAT)
  end: string;
  venue: VenueKey;
  blurb: string;
  expect: string[];
  dress: string;
  note?: string;
};

export const event = {
  name: "Youth Choir Week",
  short: "YCW",
  year: 2026,
  theme: "Lift every voice",
  city: "Eket",
  state: "Akwa Ibom State",
  country: "Nigeria",
  timezone: "Africa/Lagos",
  question: "Are you ready for Youth Choir Week 2026?",
  fireFrom: "Youth Choir Week",
  lead: "We have just one question for you",
  rsvpUrl: "#rsvp",
  days: [
    {
      day: 1,
      title: "Leadership Session",
      verb: "Lead",
      date: "2026-12-14",
      start: "10:00",
      end: "14:00",
      venue: "deExchange",
      blurb: "We open the week together in the Exchange Hall: a morning on leading with your voice, serving your section and building a choir culture that lasts.",
      expect: ["Welcome & opening worship", "Leadership talks and panel", "Section leaders’ breakout circles", "Lunch & fellowship"],
      dress: "Smart casual",
    },
    {
      day: 2,
      title: "Movie Night",
      verb: "Watch",
      date: "2026-12-15",
      start: "19:00",
      end: "22:30",
      venue: "royalty",
      blurb: "An open-air screening under the Eket night sky at Royalty Hotels: popcorn, good company and a film that will have the whole choir talking.",
      expect: ["Red-carpet arrival photos", "Open-air screening", "Popcorn & drinks", "Post-movie conversation"],
      dress: "Cosy & casual: bring a light jacket",
    },
    {
      day: 3,
      title: "Excursion",
      verb: "Explore",
      date: "2026-12-16",
      start: "08:00",
      end: "17:00",
      venue: "amalgamation",
      blurb: "A road trip west to Ikot Abasi and the historic Amalgamation House on the banks of the Imo River, where a defining chapter of Nigeria’s story was written.",
      expect: ["08:00 departure from Eket by bus", "Guided tour of Amalgamation House", "Riverside lunch on the Imo River", "Group photos & choir moment on site"],
      dress: "Comfortable walking wear & sun protection",
      note: "Ikot Abasi is about 45 km (≈ 1 hour) from Eket. Transport leaves together from DE Exchange.",
    },
    {
      day: 4,
      title: "Games Night",
      verb: "Play",
      date: "2026-12-17",
      start: "19:00",
      end: "23:00",
      venue: "blade",
      blurb: "Blade Lounge turns into our arena: friendly rivalry between sections, music, laughter and prizes for the loudest team.",
      expect: ["Team games between choir sections", "Pool, table tennis & board games", "Karaoke & sing-offs", "Prizes for the winning section"],
      dress: "Wear your section colours",
    },
    {
      day: 5,
      title: "Dinner & Awards Night",
      verb: "Celebrate",
      date: "2026-12-18",
      start: "18:00",
      end: "23:00",
      venue: "deExchange",
      blurb: "We close where we began: a candle-lit dinner in the garden at DE Exchange, honouring the voices, leaders and moments that made the week.",
      expect: ["Red-carpet arrival", "Three-course dinner", "Awards & recognition", "Final choir performance"],
      dress: "Formal / black tie optional",
    },
  ] as DayInfo[],
};

export type Event = typeof event;

const fmt = (d: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-GB", { ...o, timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`));
export const dayLabel = (d: string) => fmt(d, { weekday: "short", day: "numeric", month: "short" });
export const dayLong = (d: string) => fmt(d, { weekday: "long", day: "numeric", month: "long" });
export function weekRange() {
  const a = event.days[0].date;
  const b = event.days[event.days.length - 1].date;
  return `${fmt(a, { day: "numeric" })}–${fmt(b, { day: "numeric", month: "long", year: "numeric" })}`;
}
export function time12(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}
/** Epoch ms for a WAT (UTC+1, no DST) wall-clock time. */
export const watEpoch = (date: string, hhmm: string) => Date.parse(`${date}T${hhmm}:00+01:00`);

/** Where "now" sits in the week. */
export function weekState(now = Date.now()) {
  const d = event.days;
  const first = watEpoch(d[0].date, d[0].start);
  const last = watEpoch(d[d.length - 1].date, d[d.length - 1].end);
  if (now >= last) return { kind: "ended" as const };
  const live = d.find((x) => now >= watEpoch(x.date, x.start) && now < watEpoch(x.date, x.end));
  if (live) return { kind: "live" as const, day: live };
  const next = d.find((x) => watEpoch(x.date, x.start) > now)!;
  const s = Math.max(0, Math.floor((watEpoch(next.date, next.start) - now) / 1000));
  return { kind: now < first ? ("before" as const) : ("between" as const), day: next, days: Math.floor(s / 86400), hours: Math.floor(s / 3600) % 24, minutes: Math.floor(s / 60) % 60, seconds: s % 60 };
}
