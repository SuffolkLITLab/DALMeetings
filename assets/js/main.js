const TIME_ZONE_ALIASES = Object.freeze({
  eastern: 'America/New_York',
  central: 'America/Chicago',
  mountain: 'America/Denver',
  pacific: 'America/Los_Angeles',
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

  if (meeting.startTime && meeting.endTime && endTime) {
    const [startText, endText] = formatMeetingTimes(meeting, timeZone).split('–');
    startTime.textContent = startText.trim();
    endTime.textContent = endText.trim();
  }

  if (meeting.startTime && meeting.day) {
    article.appendChild(createAddToCalendarLinks(meeting));
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

function getTimeZoneOffsetMinutes(timeZone, date) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });

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

function formatMeetingTimes(meeting, timeZone) {
  const meetingDate = getMeetingDate(meeting);
  const [startHour, startMinute] = parseTimeString(meeting.startTime);
  const [endHour, endMinute] = parseTimeString(meeting.endTime);
  const baseTimeZone = resolveTimeZone(meeting.timeZone);
  const targetTimeZone = resolveTimeZone(timeZone);

  const startDate = createDateInTimeZone(
    baseTimeZone,
    meetingDate.getFullYear(),
    meetingDate.getMonth(),
    meetingDate.getDate(),
    startHour,
    startMinute
  );
  const endDate = createDateInTimeZone(
    baseTimeZone,
    meetingDate.getFullYear(),
    meetingDate.getMonth(),
    meetingDate.getDate(),
    endHour,
    endMinute
  );

  const formatter = new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: targetTimeZone
  });

  return `${formatter.format(startDate)}–${formatter.format(endDate)}`;
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

  if (recurrence.frequency === 'monthly') {
    const dayAbbreviation = DAY_ABBREVIATIONS[meeting.day];
    return `FREQ=MONTHLY;INTERVAL=${interval};BYDAY=${recurrence.weekOfMonth}${dayAbbreviation}`;
  }

  return `FREQ=WEEKLY;INTERVAL=${interval}`;
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
  const dtStamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;
  const uid = `${toPlainText(meeting.title).replace(/\s+/g, '-').toLowerCase()}-${meeting.day.toLowerCase()}@dalmeetings.suffolklitlab.org`;

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Suffolk LIT Lab//DAL Community Meetings//EN',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${dtStamp}`,
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

function createAddToCalendarLinks(meeting) {
  const fragment = document.createDocumentFragment();

  const label = document.createElement('p');
  label.className = 'addToCalendarLinksLabel';
  label.textContent = 'Add to your calendar:';
  fragment.appendChild(label);

  const list = document.createElement('ul');
  list.className = 'addToCalendarLinks';

  const occurrenceDate = getMeetingOccurrenceDate(meeting);
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

