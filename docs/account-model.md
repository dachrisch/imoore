# Account & Profile Model

imoo does not have a traditional user profile page. Identity is structured around **roles relative to a watch**, not around a standalone user profile.

## Account Types

| Account | API resource | Description |
|---|---|---|
| `mobileaccount` | `/mobileaccount` | Guardian's phone account — the app login identity |
| `watchaccount` | `/watchaccount` | The watch device's own account (the child's identity) |
| `geniusAccount` | `/geniusAccount` | Secondary sub-account for additional family members |
| `imAccount` | `/imAccount/exit/{watchId}` | IM/chat identity tied to the watch |

## Admin vs. Member

Each phone is linked to a watch via a `mobilewatch` relationship. Within that relationship, exactly one phone holds the **admin** role; all others are **members**.

| Role | What they see | What they can do |
|---|---|---|
| Admin | Full settings UI | Contacts, class mode, sound, watch attributes, family management |
| Member | Watch location + notifications only | Read-only; no settings or profile UI exposed |

The app intentionally hides management surfaces from members — this is by design, not a bug.

### Relevant endpoints

```
GET  /mobilewatch                        — list watches linked to this phone
GET  /mobilewatch/watch/{watchId}        — watch details
POST /mobilewatch/changeadmin            — transfer admin role (admin only)
POST /smartwatch/mobilewatch/apply/admin — member requests admin role
POST /smartwatch/mobilewatch/apply/admin/refuse — admin rejects the request
POST /smartwatch/mobilewatch/dismissFamily — remove a member from the family
```

## Joining a Family (invitation code)

The family-invite screen shows a QR plus a 16-character "Kopplungscode"
(coupling code). It is an **invitation/binding reference, not a login
credential**:

- The QR is built as `<DomainManager.serverUrl>/d/<bindNumber>` in
  `account/activity/talent/utils/Greece`; `bindNumber` comes from
  `TalentAccountBean.getBindNumber()`.
- Scanning it opens `H5Api.startCommonH5NoParam` — an H5 landing page, not an
  API call (`account/activity/bind/utils/Guatemala.Gambia`).
- Live check (2026-10-21): `GET https://watch-oz.okii.com/d/akatbiwcbzpbpowok`
  → `302` → `https://static.watch.okii.com/watch/download/xtc.html`
  (the app-download page). The plain host redirects to the imoo download page
  instead.
- The actual join/bind runs on **token-authenticated core endpoints** —
  `/smartwatch/mobilewatch`, `/smartwatch/mobilewatch/apply/admin`,
  `/smartwatch/watchaccount/bindnumber`, `/geniusAccount/*`,
  `/group-chat/familyGroup/invite` — and needs the admin's approval.

So the code only becomes usable inside the app **after** a session exists
(SMS or password login). It cannot create a session by itself.

### Bind endpoint

The code is consumed by `POST /smartwatch/watchaccount/bindnumber`:

```json
{ "bindNumber": "akatbiwcbzpbpowok", "randcode": "<optional>" }
```

(`WatchAccountHttpService.getByBindNumber`, called from `BindNumberHelper` →
`Guinea.A2` → `http/Germany.Gabon`; `randcode` is omitted when empty.)

Live check (2026-10-21) without a session:

```
POST https://watch-oz.okii.com/smartwatch/watchaccount/bindnumber
{"bindNumber":"akatbiwcbzpbpowok"}
→ HTTP 502  {"code":"100500","desc":"api gateway error"}
```

`/smartwatch/mobilewatch` without a token answers `000004` (business error),
so `100500` here is the gateway rejecting the unauthenticated call before any
bind logic. The prototype exposes this as `POST /api/bind` (requires `token`).

## Family Group

Members are gathered into a family group for group chat:

```
GET  /group-chat/familyGroup/groups   — list groups
GET  /group-chat/familyGroup/members  — list members
POST /group-chat/familyGroup/create
POST /group-chat/familyGroup/invite
POST /group-chat/familyGroup/quit
POST /group-chat/familyGroup/dismiss
```

## Profile Management

Profile editing is scoped to specific resources — there is no single `/profile` endpoint:

| Action | Endpoint |
|---|---|
| Update watch child's name | `POST /watchaccount/updateBabyName` |
| Update real name | `POST /smartwatch/watchaccount/updateRealName` |
| Update watch attributes | `POST /smartwatch/watchaccount/update/watchAttribute` |
| Update secondary account icon | `POST /geniusAccount/updateGeniusIcon` |
| Update secondary account number | `POST /geniusAccount/updateNumber` |
| Set secondary account password | `POST /geniusAccount/settingPassword` |
| Change phone number | `POST /app/modifyUserPhone` |
| Change password | `POST /app/modifyPassword` |
| Delete account | `POST /app/deleteAccount` / `POST /app/v2/deleteAccount` |

## Why You See Yourself Only as a Member

If you were added to a watch by another guardian, your phone was registered as a `geniusAccount` (secondary slot). The app shows you in the member list but offers no profile editing UI — all management belongs to the admin. To gain admin access, either request it (`apply/admin`) or have the current admin transfer it (`changeadmin`).

Role and login are orthogonal: every phone number authenticates through the same `/app/*` endpoints (`sendRandCodeV2` + `randcodeLogin`, or `/app/loginV2` with a password). A `geniusAccount` carries its own `number` and password (`TalentAccountBean.number` / `passwordBlank`, set by the admin via `geniusAccount/settingPassword`), so a member logs in with that number and password. A number that was only added as a contact, or whose invitation was never completed, has no login account at all — that is the case to rule out first when both SMS and password fail.
