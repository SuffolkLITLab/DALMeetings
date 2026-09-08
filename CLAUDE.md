# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A static site that displays the Suffolk LIT Lab Document Assembly Line community meeting schedule, converted to the viewer's local time zone. Deployed at dalmeetings.suffolklitlab.org (see `CNAME`) via GitHub Pages. No build step, no framework, no package.json — plain HTML/CSS/JS.

## Development

- Preview locally with any static file server, e.g. `http-server` (mentioned in README) or `python3 -m http.server`.
- There is no build, lint, or test tooling in this repo.

## Architecture

- `meetings.json` is the single source of truth for meeting data. Each entry has `title`, `day`, `startTime`, `endTime` (optional), `timeZone`, `note` (optional), `recurrence` (optional), `meetingLinkText`, `meetingLinkURL`. All fields except `endTime`, `note`, and `recurrence` are required. `title`, `note`, and `meetingLinkText` allow only `<strong>` and `<em>` markup.
- `recurrence` is `{ frequency: "weekly" | "monthly", interval?: number, weekOfMonth?: number, startDate?: string }`. Omitted = plain weekly. `interval` is every N weeks/months (2 = biweekly, 3 = quarterly for monthly). `weekOfMonth` (required for `"monthly"`) is which occurrence of `day` in the month, `1`-`4` or `-1` for last. `startDate` (`YYYY-MM-DD`, required whenever `interval` > 1) anchors which week/month is "on" for a biweekly-or-quarterly-style cadence — there's no way to derive that from `day`/`interval` alone (e.g. quarterly could be Jan/Apr/Jul/Oct or any other 3-month offset depending on where it actually falls; `getNextWeeklyOccurrenceFromAnchor`/`getNextMonthlyOccurrenceFromAnchor` in `main.js` walk forward from `startDate` in `interval`-sized steps to find the next real occurrence). Without `startDate`, code falls back to a heuristic (next matching weekday, or assumes months divisible by `interval` starting from January) and logs a console warning. It maps to an iCalendar `RRULE` (`FREQ=WEEKLY;INTERVAL=n` or `FREQ=MONTHLY;INTERVAL=n;BYDAY={weekOfMonth}{DAY}`) for generating add-to-calendar links.
- `index.html` is a static shell with one empty container per weekday (`#Monday`...`#Friday`); all content is injected client-side.
- `assets/js/main.js` does everything at runtime:
  - Fetches `meetings.json` and sanitizes every string field through `sanitizeData`/`sanitizeText`, which strips all HTML except `<strong>`/`<em>` (defense against injecting arbitrary markup via the JSON data file).
  - `TIME_ZONE_ALIASES` maps friendly names used in `meetings.json` (e.g. `"Eastern"`, `"Central"`) to IANA time zones; this is the list referenced by the README as "where timeZone values come from."
  - Time conversion is manual: `getMeetingDate` finds the next occurrence of a meeting's weekday, `parseTimeString` parses "3:00 PM"-style strings, and `createDateInTimeZone`/`getTimeZoneOffsetMinutes` build a real `Date` for that wall-clock time in the meeting's source time zone before reformatting into the viewer-selected time zone.
  - The time zone `<select>` is populated from the deduped values of `TIME_ZONE_ALIASES` and defaults to the visitor's detected local time zone if it matches one of the options; changing it re-renders all meetings without refetching data.
  - `renderMeetings` groups meetings by day, sorts each day by start time, and rebuilds the DOM for each `.day` container.
- `assets/css/style.css` uses a Suffolk-branded color/typography variable set at the top (`--suffolk-*`, `--font-size-*`) and a CSS grid (one column per weekday, collapsing to one column under 768px).

## Editing meeting data

To add/change a meeting, edit `meetings.json` directly — no code changes needed unless introducing a new time zone alias (add it to `TIME_ZONE_ALIASES` in `assets/js/main.js`).
