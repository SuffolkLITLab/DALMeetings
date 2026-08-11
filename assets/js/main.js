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

  if (meeting.schedulingNote) {
    const note = document.createElement('p');
    note.className = 'meetingNote';
    note.textContent = meeting.schedulingNote;
    article.appendChild(note);
  }

  if (meeting.meetingLinkURL) {
    const link = document.createElement('a');
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
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const currentDayIndex = today.getDay();
  const targetDayIndex = dayNames.indexOf(meeting.day);

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

