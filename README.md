# imoo Watch API

Reverse-engineered REST API reference for the **imoo Watch** companion app (`com.imoo.watch.global`).

## View the Swagger UI

→ **[Open in Swagger Editor](https://editor.swagger.io/?url=https://raw.githubusercontent.com/dachrisch/imoo-watch-api/main/openapi.yaml)**

## Services

| Service | Base URL | Description |
|---|---|---|
| Core API | `https://watch.okii.com` | Auth, account, contacts, app store, settings, payments |
| Location API | `https://location.watch.okii.com` | Real-time tracking, trails, guard modes, geofencing |
| Health & Sport | `https://sport.watch.okii.com` | Health summary, sport data |
| Chat | `https://chat.watch.okii.com` | Messaging, voice, video calls |
| Points | `https://points.okii.com` | Points, reward tasks |
| CDN | `https://watch.okii.com` | Announcements, media assets |

International region mirrors exist at `*-oz.okii.com` (e.g. `api-oz.okii.com`).

## Methodology

Static analysis of the Android APK (`com.imoo.watch.global`):

1. Pulled APK via `adb pull`
2. Unzipped APK, extracted 12 DEX files
3. Ran `strings` on all DEX files to extract URL and path constants
4. Filtered and classified ~240 endpoints across 6 services

**HTTP methods are inferred** from endpoint naming conventions (e.g. `get*` → GET, `add*`/`create*` → POST, `delete*` → DELETE) and may not be exact. Request/response schemas are placeholders.

## Coverage

| Tag group | Count |
|---|---|
| Authentication (all flows) | 31 |
| Watch Account & Device Binding | 17 |
| Contacts & Friends | 16 |
| Watch Settings (`/smartwatch/`) | 58 |
| Watch Functions & Class Mode | 20 |
| Location & Tracking | 8 |
| Guard Modes (5 types) | 31 |
| Indoor / 3D | 7 |
| Video Calls | 9 |
| App Store | 12 |
| Media & Files | 9 |
| Health & Sport | 3 |
| Payment | 6 |
| Notifications & Find Watch | 9 |
| … and more | |

## Interesting endpoints for extending functionality

| Endpoint | Notes |
|---|---|
| `/smartwatch/outdoorActivities/getDetail` | Richer activity data than the app shows |
| `/sport-service/health/i32/home` | Health summary — model suffix likely device-class |
| `/sport-service/health/nd01/home` | Alternative model endpoint |
| `/flutterSport` | Flutter-bridged sport data |
| `/app/myUpdates` | May expose a broader update feed |
| `/contrail/queryData` | Historical movement data with time range params |
| `/watchData/getData` | Raw sensor data |
| `/watch-func/habit/*` | Habit task management |

## Disclaimer

This is personal research for a device I own, intended to add features the official app doesn't expose. Not affiliated with or endorsed by imoo / BBK Electronics.
