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
	"meetingLinkText": "Zoom",
	"meetingLinkURL": "https://suffolk.zoom.us/meeting/register/tJAsce-oqTorGd3QACxQDBwGGGnVK8tehTaV"
}
```

Notes:

- `timeZone` can be any of a limited set of[ IANA time zones](https://www.iana.org/time-zones) and aliases, found at the beginning of [`main.js`](https://github.com/SuffolkLITLab/DALMeetings/blob/main/assets/js/main.js)
- All properties except `endTime` and `note` are required
- `<strong>` and `<em>` are allowed in `title`, `note`, and `meetingLinkText`
- No build step is required, but you can use `http-server` to preview changes before comitting them