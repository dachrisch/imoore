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
