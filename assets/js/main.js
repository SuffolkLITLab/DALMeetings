const TIME_ZONE_ALIASES = Object.freeze({
  eastern: 'America/New_York',
  central: 'America/Chicago',
  mountain: 'America/Denver',
  pacific: 'America/Los_Angeles',
  alaska: 'America/Anchorage',
  hawaii: 'Pacific/Honolulu',
  london: 'Europe/London',
  paris: 'Europe/Paris',
  berlin: 'Europe/Berlin',
  cairo: 'Africa/Cairo',
  jerusalem: 'Asia/Jerusalem',
  kolkata: 'Asia/Kolkata',
  shanghai: 'Asia/Shanghai',
  tokyo: 'Asia/Tokyo',
  sydney: 'Australia/Sydney',
  auckland: 'Pacific/Auckland'
});

const TIME_ZONE_OPTIONS = Object.freeze(Array.from(new Set(Object.values(TIME_ZONE_ALIASES))));

const DAY_NAMES = Object.freeze(['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']);

const DAY_ABBREVIATIONS = Object.freeze({
  Sunday: 'SU',
  Monday: 'MO',
  Tuesday: 'TU',
  Wednesday: 'WE',
  Thursday: 'TH',
  Friday: 'FR',
  Saturday: 'SA'
});

function sanitizeText(value) {
  if (typeof value !== 'string') {
    return value;
  }

  const allowedTags = new Set(['strong', 'em']);
  const container = document.createElement('div');
  container.innerHTML = value;

  const sanitizeNode = (sourceNode, targetNode) => {
    Array.from(sourceNode.childNodes).forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        targetNode.appendChild(document.createTextNode(child.textContent));
        return;
      }

      if (child.nodeType !== Node.ELEMENT_NODE) {
        return;
      }

      const tagName = child.tagName.toLowerCase();

      if (allowedTags.has(tagName)) {
        const safeNode = document.createElement(tagName);
        sanitizeNode(child, safeNode);
        targetNode.appendChild(safeNode);
      } else {
        sanitizeNode(child, targetNode);
      }
    });
  };

  const safeRoot = document.createElement('div');
  sanitizeNode(container, safeRoot);

  return safeRoot.innerHTML.replace(/\s+/g, ' ').trim();
}

function sanitizeData(value, key) {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeData(item, key));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entryValue]) => [
        entryKey,
        sanitizeData(entryValue, entryKey)
      ])
    );
  }

  if (typeof value === 'string') {
    return key === 'meetingLinkURL' ? value.trim() : sanitizeText(value);
  }

  return value;
}

async function fetchAndSanitizeMeetings(url = '/meetings.json') {
  const response = await fetch(url, { cache: 'no-store' });

  if (!response.ok) {
    throw new Error(`Unable to fetch ${url}: ${response.status}`);
  }

  const data = await response.json();
  return sanitizeData(data);
}

function createMeetingElement(meeting, timeZone) {
  const article = document.createElement('article');
  article.className = 'meeting';

  const time = document.createElement('p');
  time.className = 'meetingTime';

  const startTime = document.createElement('span');
  startTime.className = 'time startTime';
  startTime.textContent = meeting.startTime || '';
  time.appendChild(startTime);

  const hasEndTime = Boolean(meeting.endTime);
  let endTime = null;

  if (hasEndTime) {
    const separator = document.createTextNode('–');
    time.appendChild(separator);

    endTime = document.createElement('span');
    endTime.className = 'time endTime';
    endTime.textContent = meeting.endTime || '';
    time.appendChild(endTime);
  }

  article.appendChild(time);

  const title = document.createElement('h3');
  title.className = 'meetingTitle';
  title.innerHTML = meeting.title || 'Untitled meeting';
  article.appendChild(title);

  if (meeting.note) {
    const note = document.createElement('p');
    note.className = 'meetingNote';
    note.textContent = meeting.note;
    article.appendChild(note);
  }

  if (meeting.meetingLinkURL) {
    const link = document.createElement('a');
    link.classList.add('meetingLink');
    link.href = meeting.meetingLinkURL;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.innerHTML = meeting.meetingLinkText || 'Join meeting';
    article.appendChild(link);
  }

  const hasValidRecurrence = validateRecurrence(meeting);
  const occurrenceDate = hasValidRecurrence ? getMeetingOccurrenceDate(meeting) : getMeetingDate(meeting);

  if (meeting.startTime) {
    const [startText, endText] = formatMeetingTimes(meeting, timeZone, occurrenceDate);
    startTime.textContent = startText;

    if (endTime) {
      endTime.textContent = endText;
    }
  }

  if (meeting.startTime && meeting.day && hasValidRecurrence) {
    article.appendChild(createAddToCalendarLinks(meeting, occurrenceDate));
  }

  return article;
}

function resolveTimeZone(value) {
  if (!value || value === 'local') {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  }

  const normalizedValue = String(value).trim().toLowerCase();
  return TIME_ZONE_ALIASES[normalizedValue] || value;
}

function getMeetingDate(meeting) {
  const today = new Date();
  const currentDayIndex = today.getDay();
  const targetDayIndex = DAY_NAMES.indexOf(meeting.day);

  if (targetDayIndex === -1) {
    return today;
  }

  const offset = (targetDayIndex - currentDayIndex + 7) % 7;
  const meetingDate = new Date(today);
  meetingDate.setDate(today.getDate() + offset);
  return meetingDate;
}

const offsetFormatters = new Map();

function getOffsetFormatter(timeZone) {
  if (!offsetFormatters.has(timeZone)) {
    // hourCycle h23 rather than hour12: false, which some browsers render as "24" at midnight.
    offsetFormatters.set(timeZone, new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23'
    }));
  }

  return offsetFormatters.get(timeZone);
}

function getTimeZoneOffsetMinutes(timeZone, date) {
  const formatter = getOffsetFormatter(timeZone);

  const parts = Object.fromEntries(
    formatter.formatToParts(date).filter((part) => ['year', 'month', 'day', 'hour', 'minute', 'second'].includes(part.type)).map((part) => [part.type, part.value])
  );

  const utcTime = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );

  return (utcTime - date.getTime()) / 60000;
}

function createDateInTimeZone(baseTimeZone, year, month, day, hour, minute) {
  const localDate = new Date(Date.UTC(year, month, day, hour, minute));
  const offsetMinutes = getTimeZoneOffsetMinutes(baseTimeZone, localDate);
  return new Date(localDate.getTime() - offsetMinutes * 60000);
}

// Converts on the meeting's actual next occurrence (not just the next matching weekday), so the
// displayed times match the add-to-calendar links even when a DST change falls in between.
function formatMeetingTimes(meeting, timeZone, occurrenceDate) {
  const baseTimeZone = resolveTimeZone(meeting.timeZone);
  const targetTimeZone = resolveTimeZone(timeZone);

  const formatter = new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: targetTimeZone
  });

  const toDisplayTime = (value) => {
    const [hour, minute] = parseTimeString(value);
    return formatter.format(createDateInTimeZone(
      baseTimeZone,
      occurrenceDate.getFullYear(),
      occurrenceDate.getMonth(),
      occurrenceDate.getDate(),
      hour,
      minute
    ));
  };

  return [toDisplayTime(meeting.startTime), meeting.endTime ? toDisplayTime(meeting.endTime) : null];
}

function parseTimeString(value) {
  if (!value) {
    return [0, 0];
  }

  const normalized = value.trim().toUpperCase();
  const match = normalized.match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?/);

  if (!match) {
    return [0, 0];
  }

  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2] || '0', 10);
  const period = match[3];

  if (period === 'PM' && hours < 12) {
    hours += 12;
  }

  if (period === 'AM' && hours === 12) {
    hours = 0;
  }

  return [hours, minutes];
}

function pad(value) {
  return String(value).padStart(2, '0');
}

function toPlainText(html) {
  const container = document.createElement('div');
  container.innerHTML = html || '';
  return container.textContent || '';
}

function escapeICSText(value) {
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

function formatDateTimeForCalendar(year, month, day, hour, minute) {
  return `${year}${pad(month + 1)}${pad(day)}T${pad(hour)}${pad(minute)}00`;
}

function formatUTCDateTimeForCalendar(date) {
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
}

function formatUTCOffset(minutes) {
  const sign = minutes < 0 ? '-' : '+';
  const absoluteMinutes = Math.abs(minutes);
  return `${sign}${pad(Math.floor(absoluteMinutes / 60))}${pad(absoluteMinutes % 60)}`;
}

// Narrows a UTC offset change between startTime and endTime down to the first minute of the new offset.
function findOffsetTransition(timeZone, startTime, endTime) {
  const offsetFrom = getTimeZoneOffsetMinutes(timeZone, new Date(startTime));
  let low = startTime;
  let high = endTime;

  while (high - low > 60000) {
    const middle = low + Math.floor((high - low) / 120000) * 60000;

    if (getTimeZoneOffsetMinutes(timeZone, new Date(middle)) === offsetFrom) {
      low = middle;
    } else {
      high = middle;
    }
  }

  return { time: high, offsetFrom, offsetTo: getTimeZoneOffsetMinutes(timeZone, new Date(high)) };
}

function describeOffsetTransition(transition) {
  // VTIMEZONE observances start at the wall-clock time just before the change, in the old offset.
  const localTime = new Date(transition.time + transition.offsetFrom * 60000);
  const year = localTime.getUTCFullYear();
  const month = localTime.getUTCMonth();
  const day = localTime.getUTCDate();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

  return {
    ...transition,
    year,
    month,
    day,
    hour: localTime.getUTCHours(),
    minute: localTime.getUTCMinutes(),
    weekday: localTime.getUTCDay(),
    weekOfMonth: Math.ceil(day / 7),
    isLastWeekOfMonth: day + 7 > daysInMonth
  };
}

function getOffsetTransitions(timeZone, fromYear, toYear) {
  const transitions = [];

  for (let year = fromYear; year <= toYear; year++) {
    for (let month = 0; month < 12; month++) {
      const monthStart = Date.UTC(year, month, 1);
      const monthEnd = Date.UTC(year, month + 1, 1);

      if (getTimeZoneOffsetMinutes(timeZone, new Date(monthStart)) !== getTimeZoneOffsetMinutes(timeZone, new Date(monthEnd))) {
        transitions.push(describeOffsetTransition(findOffsetTransition(timeZone, monthStart, monthEnd)));
      }
    }
  }

  return transitions;
}

function buildTimeZoneObservance(transitions) {
  const [first] = transitions;
  const name = first.offsetTo > first.offsetFrom ? 'DAYLIGHT' : 'STANDARD';
  const lines = [
    `BEGIN:${name}`,
    `DTSTART:${formatDateTimeForCalendar(first.year, first.month, first.day, first.hour, first.minute)}`,
    `TZOFFSETFROM:${formatUTCOffset(first.offsetFrom)}`,
    `TZOFFSETTO:${formatUTCOffset(first.offsetTo)}`
  ];

  const followsYearlyRule = transitions.every((transition) => (
    transition.month === first.month &&
    transition.weekday === first.weekday &&
    transition.hour === first.hour &&
    transition.minute === first.minute
  ));
  const dayAbbreviation = DAY_ABBREVIATIONS[DAY_NAMES[first.weekday]];

  if (followsYearlyRule && first.weekOfMonth <= 4 && transitions.every((transition) => transition.weekOfMonth === first.weekOfMonth)) {
    lines.push(`RRULE:FREQ=YEARLY;BYMONTH=${first.month + 1};BYDAY=${first.weekOfMonth}${dayAbbreviation}`);
  } else if (followsYearlyRule && transitions.every((transition) => transition.isLastWeekOfMonth)) {
    lines.push(`RRULE:FREQ=YEARLY;BYMONTH=${first.month + 1};BYDAY=-1${dayAbbreviation}`);
  } else {
    // Rules that don't fit "nth weekday of the month" (e.g. Jerusalem) get explicit dates instead.
    transitions.slice(1).forEach((transition) => {
      lines.push(`RDATE:${formatDateTimeForCalendar(transition.year, transition.month, transition.day, transition.hour, transition.minute)}`);
    });
  }

  lines.push(`END:${name}`);
  return lines;
}

const vTimeZoneCache = new Map();

// Builds the VTIMEZONE definition that RFC 5545 requires for every TZID an .ics file uses. Without
// it, some clients (notably Outlook) misread TZID-qualified times as local or UTC.
function buildVTimeZone(timeZone, year) {
  const cacheKey = `${timeZone}|${year}`;

  if (vTimeZoneCache.has(cacheKey)) {
    return vTimeZoneCache.get(cacheKey);
  }

  // Start a year early so the observances cover the event's start, and look ahead far enough
  // to confirm each transition follows a consistent yearly rule.
  const transitions = getOffsetTransitions(timeZone, year - 1, year + 9);
  const lines = ['BEGIN:VTIMEZONE', `TZID:${timeZone}`];

  if (transitions.length === 0) {
    const offset = formatUTCOffset(getTimeZoneOffsetMinutes(timeZone, new Date(Date.UTC(year, 0, 1))));
    lines.push('BEGIN:STANDARD', 'DTSTART:19700101T000000', `TZOFFSETFROM:${offset}`, `TZOFFSETTO:${offset}`, 'END:STANDARD');
  } else {
    const transitionsByOffsets = new Map();

    transitions.forEach((transition) => {
      const key = `${transition.offsetFrom}/${transition.offsetTo}`;

      if (!transitionsByOffsets.has(key)) {
        transitionsByOffsets.set(key, []);
      }

      transitionsByOffsets.get(key).push(transition);
    });

    transitionsByOffsets.forEach((group) => lines.push(...buildTimeZoneObservance(group)));
  }

  lines.push('END:VTIMEZONE');
  vTimeZoneCache.set(cacheKey, lines);
  return lines;
}

function getNthWeekdayOfMonth(year, month, dayIndex, weekOfMonth) {
  if (weekOfMonth === -1) {
    const lastOfMonth = new Date(year, month + 1, 0);
    const diff = (lastOfMonth.getDay() - dayIndex + 7) % 7;
    return new Date(year, month, lastOfMonth.getDate() - diff);
  }

  const firstOfMonth = new Date(year, month, 1);
  const diff = (dayIndex - firstOfMonth.getDay() + 7) % 7;
  return new Date(year, month, 1 + diff + (weekOfMonth - 1) * 7);
}

function getNextMonthlyOccurrence(today, dayIndex, weekOfMonth, interval) {
  let year = today.getFullYear();
  let month = today.getMonth();
  const todayDateOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  for (let i = 0; i < interval * 4; i++) {
    if (month % interval === 0) {
      const candidate = getNthWeekdayOfMonth(year, month, dayIndex, weekOfMonth);
      if (candidate >= todayDateOnly) {
        return candidate;
      }
    }

    month += 1;
    if (month > 11) {
      month = 0;
      year += 1;
    }
  }

  return today;
}

function getNextMonthlyOccurrenceFromAnchor(today, dayIndex, weekOfMonth, interval, anchorDate) {
  const todayDateOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  let year = anchorDate.getFullYear();
  let month = anchorDate.getMonth();
  let candidate = getNthWeekdayOfMonth(year, month, dayIndex, weekOfMonth);

  while (candidate < todayDateOnly) {
    month += interval;
    while (month > 11) {
      month -= 12;
      year += 1;
    }
    candidate = getNthWeekdayOfMonth(year, month, dayIndex, weekOfMonth);
  }

  return candidate;
}

function parseISODate(value) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function addDays(date, days) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function daysBetween(from, to) {
  const utcFrom = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const utcTo = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((utcTo - utcFrom) / (24 * 60 * 60 * 1000));
}

function getNextWeeklyOccurrenceFromAnchor(today, anchorDate, interval) {
  const intervalDays = interval * 7;
  const diffDays = daysBetween(anchorDate, today);

  if (diffDays <= 0) {
    return anchorDate;
  }

  return addDays(anchorDate, Math.ceil(diffDays / intervalDays) * intervalDays);
}

function validateRecurrence(meeting) {
  const recurrence = meeting.recurrence;

  if (recurrence?.frequency === 'monthly' && ![1, 2, 3, 4, -1].includes(recurrence.weekOfMonth)) {
    console.warn(`"${toPlainText(meeting.title)}" is monthly but has no valid recurrence.weekOfMonth (1-4 or -1), so its calendar links were left out.`);
    return false;
  }

  return true;
}

function getMeetingOccurrenceDate(meeting) {
  const recurrence = meeting.recurrence || { frequency: 'weekly', interval: 1 };
  const interval = recurrence.interval || 1;

  if (recurrence.frequency === 'monthly') {
    const dayIndex = DAY_NAMES.indexOf(meeting.day);

    if (interval > 1) {
      if (recurrence.startDate) {
        return getNextMonthlyOccurrenceFromAnchor(new Date(), dayIndex, recurrence.weekOfMonth, interval, parseISODate(recurrence.startDate));
      }

      console.warn(`"${toPlainText(meeting.title)}" has a monthly interval of ${interval} but no recurrence.startDate, so its calendar links may land on the wrong month.`);
    }

    return getNextMonthlyOccurrence(new Date(), dayIndex, recurrence.weekOfMonth, interval);
  }

  if (interval > 1) {
    if (recurrence.startDate) {
      return getNextWeeklyOccurrenceFromAnchor(new Date(), parseISODate(recurrence.startDate), interval);
    }

    console.warn(`"${toPlainText(meeting.title)}" has a weekly interval of ${interval} but no recurrence.startDate, so its calendar links may land on the wrong week.`);
  }

  return getMeetingDate(meeting);
}

function buildRRule(meeting) {
  const recurrence = meeting.recurrence || { frequency: 'weekly', interval: 1 };
  const interval = recurrence.interval || 1;
  let until = '';

  if (recurrence.endDate) {
    // UNTIL must be in UTC when DTSTART has a TZID, so use the end of endDate in the meeting's time zone.
    const endDate = parseISODate(recurrence.endDate);
    const lastMoment = createDateInTimeZone(resolveTimeZone(meeting.timeZone), endDate.getFullYear(), endDate.getMonth(), endDate.getDate(), 23, 59);
    until = `;UNTIL=${formatUTCDateTimeForCalendar(lastMoment)}`;
  }

  if (recurrence.frequency === 'monthly') {
    const dayAbbreviation = DAY_ABBREVIATIONS[meeting.day];
    return `FREQ=MONTHLY;INTERVAL=${interval};BYDAY=${recurrence.weekOfMonth}${dayAbbreviation}${until}`;
  }

  return `FREQ=WEEKLY;INTERVAL=${interval}${until}`;
}

function buildGoogleCalendarURL(meeting, occurrenceDate, startHour, startMinute, endHour, endMinute, rrule) {
  const timeZone = resolveTimeZone(meeting.timeZone);
  const year = occurrenceDate.getFullYear();
  const month = occurrenceDate.getMonth();
  const day = occurrenceDate.getDate();

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: toPlainText(meeting.title),
    dates: `${formatDateTimeForCalendar(year, month, day, startHour, startMinute)}/${formatDateTimeForCalendar(year, month, day, endHour, endMinute)}`,
    ctz: timeZone,
    recur: `RRULE:${rrule}`
  });

  if (meeting.note) {
    params.set('details', toPlainText(meeting.note));
  }

  if (meeting.meetingLinkURL) {
    params.set('location', meeting.meetingLinkURL);
  }

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function buildICS(meeting, occurrenceDate, startHour, startMinute, endHour, endMinute, rrule) {
  const timeZone = resolveTimeZone(meeting.timeZone);
  const year = occurrenceDate.getFullYear();
  const month = occurrenceDate.getMonth();
  const day = occurrenceDate.getDate();
  const now = new Date();
  const uid = `${toPlainText(meeting.title).replace(/\s+/g, '-').toLowerCase()}-${meeting.day.toLowerCase()}@dalmeetings.suffolklitlab.org`;
  // The UID stays the same across downloads, so a newer download needs a higher SEQUENCE for
  // calendars to treat it as an update. Minutes since the epoch always increases and fits in 32 bits.
  const sequence = Math.floor(now.getTime() / 60000);

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Suffolk LIT Lab//DAL Community Meetings//EN',
    'METHOD:PUBLISH',
    ...buildVTimeZone(timeZone, year),
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `SEQUENCE:${sequence}`,
    `DTSTAMP:${formatUTCDateTimeForCalendar(now)}`,
    `DTSTART;TZID=${timeZone}:${formatDateTimeForCalendar(year, month, day, startHour, startMinute)}`,
    `DTEND;TZID=${timeZone}:${formatDateTimeForCalendar(year, month, day, endHour, endMinute)}`,
    `RRULE:${rrule}`,
    `SUMMARY:${escapeICSText(toPlainText(meeting.title))}`
  ];

  if (meeting.note) {
    lines.push(`DESCRIPTION:${escapeICSText(toPlainText(meeting.note))}`);
  }

  if (meeting.meetingLinkURL) {
    lines.push(`URL:${meeting.meetingLinkURL}`);
  }

  lines.push('END:VEVENT', 'END:VCALENDAR');

  return lines.join('\r\n');
}

function createAddToCalendarLinks(meeting, occurrenceDate) {
  const fragment = document.createDocumentFragment();

  const label = document.createElement('p');
  label.className = 'addToCalendarLinksLabel';
  label.textContent = 'Add to your calendar:';
  fragment.appendChild(label);

  const list = document.createElement('ul');
  list.className = 'addToCalendarLinks';

  const [startHour, startMinute] = parseTimeString(meeting.startTime);
  const [endHour, endMinute] = parseTimeString(meeting.endTime || meeting.startTime);
  const rrule = buildRRule(meeting);

  const googleItem = document.createElement('li');
  const googleLink = document.createElement('a');
  googleLink.href = buildGoogleCalendarURL(meeting, occurrenceDate, startHour, startMinute, endHour, endMinute, rrule);
  googleLink.target = '_blank';
  googleLink.rel = 'noopener noreferrer';
  googleLink.textContent = 'Google';
  googleItem.appendChild(googleLink);
  list.appendChild(googleItem);

  const icsContent = buildICS(meeting, occurrenceDate, startHour, startMinute, endHour, endMinute, rrule);
  const icsHref = `data:text/calendar;charset=utf-8,${encodeURIComponent(icsContent)}`;
  const icsFileName = `${toPlainText(meeting.title).replace(/\s+/g, '-').toLowerCase()}.ics`;

  const icsItem = document.createElement('li');
  const icsLink = document.createElement('a');
  icsLink.href = icsHref;
  icsLink.download = icsFileName;
  icsLink.title = 'Downloads an .ics calendar file';
  icsLink.textContent = 'Outlook/Apple (.ics)';
  icsItem.appendChild(icsLink);
  list.appendChild(icsItem);

  fragment.appendChild(list);

  return fragment;
}

function renderMeetings(meetingsData, timeZone = 'local') {
  const meetings = Array.isArray(meetingsData)
    ? meetingsData
    : meetingsData?.meetings || [];

  const dayContainers = new Map();
  const meetingsByDay = meetings.reduce((accumulator, meeting) => {
    const day = meeting.day;
    if (!accumulator[day]) {
      accumulator[day] = [];
    }

    accumulator[day].push(meeting);
    return accumulator;
  }, {});

  Object.entries(meetingsByDay).forEach(([day, dayMeetings]) => {
    const sortedMeetings = dayMeetings.sort((left, right) => {
      const leftTime = parseTimeString(left.startTime);
      const rightTime = parseTimeString(right.startTime);
      return leftTime[0] * 60 + leftTime[1] - (rightTime[0] * 60 + rightTime[1]);
    });

    let dayContainer = dayContainers.get(day);

    if (!dayContainer) {
      dayContainer = document.getElementById(day);
      if (!dayContainer) {
        return;
      }

      dayContainer.replaceChildren();
      dayContainers.set(day, dayContainer);
    }

    sortedMeetings.forEach((meeting) => {
      dayContainer.appendChild(createMeetingElement(meeting, timeZone));
    });
  });
}

function populateTimeZoneOptions() {
  const select = document.getElementById('timeZoneSelect');
  if (!select) {
    return;
  }

  select.innerHTML = '';

  const localTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const matchingTimeZone = TIME_ZONE_OPTIONS.find((timeZone) => timeZone === localTimeZone);

  TIME_ZONE_OPTIONS.forEach((timeZone) => {
    const option = document.createElement('option');
    option.value = timeZone;
    option.textContent = timeZone;
    select.appendChild(option);
  });

  if (matchingTimeZone) {
    select.value = matchingTimeZone;
  } else {
    select.value = TIME_ZONE_OPTIONS[0];
  }
}

function updateTimeZoneDisplay(timeZone) {
  const select = document.getElementById('timeZoneSelect');
  if (!select) {
    return;
  }

  const resolvedTimeZone = timeZone === 'local' ? Intl.DateTimeFormat().resolvedOptions().timeZone : timeZone;
  const localTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const matchingOption = Array.from(select.options).find((option) => option.value === timeZone);

  if (matchingOption) {
    matchingOption.textContent = timeZone === 'local' ? localTimeZone : timeZone;
  }

  select.value = timeZone;
  document.title = `Community meetings (${resolvedTimeZone})`;
}

window.addEventListener('DOMContentLoaded', () => {
  populateTimeZoneOptions();

  fetchAndSanitizeMeetings()
    .then((meetings) => {
      const select = document.getElementById('timeZoneSelect');
      const render = () => {
        const timeZone = select?.value || 'local';
        const dayContainers = document.querySelectorAll('.day');
        dayContainers.forEach((container) => container.replaceChildren());
        renderMeetings(meetings, timeZone);
        updateTimeZoneDisplay(timeZone);
      };

      select?.addEventListener('change', render);
      render();
      // console.log('Sanitized meetings data:', meetings);
    })
    .catch((error) => {
      console.error('Failed to load meetings data:', error);
    });
});

