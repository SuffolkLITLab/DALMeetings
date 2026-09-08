# Document Assembly Line community meetings

To add a meeting or change meeting details, edit [`meetings.json`](https://github.com/SuffolkLITLab/DALMeetings/blob/main/meetings.json). Here is an example:

```json
{
	"title": "First-Wednesday workshops",
	"day": "Wednesday",
	"startTime": "3:00 PM",
	"endTime": "3:50 PM",
	"timeZone": "Central",
	"note": "Held the first Wednesday of each month",
	"recurrence": { "frequency": "monthly", "weekOfMonth": 1 },
	"meetingLinkText": "Zoom",
	"meetingLinkURL": "https://suffolk.zoom.us/meeting/register/tJAsce-oqTorGd3QACxQDBwGGGnVK8tehTaV"
}
```

Notes:

- `timeZone` can be any of a limited set of[ IANA time zones](https://www.iana.org/time-zones) and aliases, found at the beginning of [`main.js`](https://github.com/SuffolkLITLab/DALMeetings/blob/main/assets/js/main.js)
- All properties except `endTime`, `note`, and `recurrence` are required
- `<strong>` and `<em>` are allowed in `title`, `note`, and `meetingLinkText`
- `recurrence` describes how a meeting repeats, and drives its "add to calendar" link. Omit it for a plain every-week meeting. Otherwise it's an object with:
  - `frequency`: `"weekly"` or `"monthly"`
  - `interval` (optional, default `1`): repeat every this many weeks/months — e.g. `2` for biweekly, `3` for quarterly
  - `weekOfMonth` (required when `frequency` is `"monthly"`): which occurrence of `day` in the month, `1`–`4`, or `-1` for the last one
  - `startDate` (required whenever `interval` is greater than `1`): an ISO date (`YYYY-MM-DD`) that falls on `day` and is a real occurrence of the meeting. Without it there's no way to tell which week/month is the "on" one for a biweekly or quarterly-style cadence (e.g. "every 3 months" could mean Jan/Apr/Jul/Oct or Feb/May/Aug/Nov depending on where it actually falls.
- No build step is required, but you can use `http-server` to preview changes before comitting them