# RBAC Permission Matrix (test fixture)

<!-- This file is the CI-committed source of truth for the §4 role × permission
     matrix. The integration test `role-matrix.integration.test.ts` parses it
     via `rbac-matrix-doc.ts`. Keep the table format: backticked permission name,
     one column per seeded role, ● (granted) / ○ (granted with conditions) / blank. -->

## 4. Role × Permission Matrix

**Legend**

| Symbol    | Meaning                                                                                                                         |
| --------- | ------------------------------------------------------------------------------------------------------------------------------- |
| ●         | Granted (global)                                                                                                                |
| ◐         | Granted **scoped** — effective only inside the chapter(s) named in the grant (§5). A `GLOBAL` grant of the same permission is ● |
| ○         | Granted **with conditions** — see §6                                                                                            |
| _(blank)_ | Not granted                                                                                                                     |

Column abbreviations: **Gst** Guest · **Stu** Student · **Alu** Alumni · **Fac** Faculty · **Stf** Staff · **Mod** Moderator · **Crd** Alumni Coordinator · **T&P** T&P Admin · **InA** Institute Admin · **SupA** Super Admin · **ChA** Chapter Admin bundle (scoped).

| Permission                     | Gst | Stu | Alu | Fac | Stf | Mod | Crd | T&P | InA | SupA | ChA |
| ------------------------------ | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :--: | :-: |
| `profile.read`                 |  ○  |  ○  |  ○  |  ○  |  ○  |  ○  |  ○  |  ○  |  ○  |  ○   |  ○  |
| `profile.read_any`             |     |     |     |     |     |     |  ●  |     |  ●  |  ●   |     |
| `profile.update`               |     |  ●  |  ●  |  ●  |  ●  |  ●  |  ●  |  ●  |  ●  |  ●   |  ●  |
| `profile.update_institutional` |     |     |     |     |     |     |  ●  |     |  ●  |  ●   |     |
| `alumni.verify`                |     |     |     |     |     |     |  ●  |     |  ●  |  ●   |     |
| `user.read_admin`              |     |     |     |     |     |  ●  |  ●  |     |  ●  |  ●   |     |
| `user.suspend`                 |     |     |     |     |     |     |     |     |  ●  |  ●   |     |
| `user.reactivate`              |     |     |     |     |     |     |     |     |  ●  |  ●   |     |
| `role.assign`                  |     |     |     |     |     |     |     |     |  ○  |  ●   |     |
| `permission.grant`             |     |     |     |     |     |     |  ○  |     |  ○  |  ●   |     |
| `directory.search`             |     |  ●  |  ●  |  ●  |  ●  |  ●  |  ●  |  ●  |  ●  |  ●   |  ●  |
| `search.global`                |     |  ●  |  ●  |  ●  |  ●  |  ●  |  ●  |  ●  |  ●  |  ●   |  ●  |
| `connection.manage`            |     |  ●  |  ●  |  ●  |  ●  |  ●  |  ●  |  ●  |  ●  |  ●   |  ●  |
| `message.send`                 |     |  ○  |  ○  |  ○  |  ○  |  ○  |  ○  |  ○  |  ○  |  ○   |  ○  |
| `message.read_reported`        |     |     |     |     |     |  ○  |     |     |  ○  |  ○   |     |
| `mentor.opt_in`                |     |     |  ●  |     |     |     |     |     |     |      |     |
| `mentor.search`                |     |  ●  |  ●  |  ●  |  ●  |  ●  |  ●  |  ●  |  ●  |  ●   |  ●  |
| `mentorship.request`           |     |  ○  |     |     |     |     |     |     |     |      |     |
| `mentorship.respond`           |     |     |  ○  |     |     |     |     |     |     |      |     |
| `job.read`                     |     |  ●  |  ●  |  ●  |  ●  |  ●  |  ●  |  ●  |  ●  |  ●   |  ●  |
| `job.create`                   |     |     |  ○  |     |     |     |     |  ○  |  ○  |  ○   |     |
| `job.approve`                  |     |     |     |     |     |     |     |  ○  |  ○  |  ○   |     |
| `job.manage`                   |     |     |     |     |     |     |     |  ●  |  ●  |  ●   |     |
| `event.read`                   |     |  ●  |  ●  |  ●  |  ●  |  ●  |  ●  |  ●  |  ●  |  ●   |  ●  |
| `event.register`               |     |  ○  |  ○  |  ○  |  ○  |  ○  |  ○  |  ○  |  ○  |  ○   |  ○  |
| `event.create`                 |     |     |     |     |     |     |  ●  |  ●  |  ●  |  ●   |  ◐  |
| `event.manage`                 |     |     |     |     |     |     |  ●  |     |  ●  |  ●   |  ◐  |
| `chapter.join`                 |     |  ●  |  ●  |  ●  |  ●  |  ●  |  ●  |  ●  |  ●  |  ●   |  ●  |
| `chapter.create`               |     |     |     |     |     |     |  ●  |     |  ●  |  ●   |     |
| `chapter.manage`               |     |     |     |     |     |     |  ●  |     |  ●  |  ●   |  ◐  |
| `post.create`                  |     |  ●  |  ●  |  ●  |  ●  |  ●  |  ●  |  ●  |  ●  |  ●   |  ●  |
| `post.interact`                |     |  ●  |  ●  |  ●  |  ●  |  ●  |  ●  |  ●  |  ●  |  ●   |  ●  |
| `post.moderate`                |     |     |     |     |     |  ●  |     |     |  ●  |  ●   |  ◐  |
| `announcement.publish`         |     |     |     |     |     |     |  ●  |     |  ●  |  ●   |  ◐  |
| `achievement.submit`           |     |     |  ●  |     |     |     |     |     |     |      |     |
| `achievement.review`           |     |     |     |     |     |     |  ●  |     |  ●  |  ●   |     |
| `report.create`                |     |  ●  |  ●  |  ●  |  ●  |  ●  |  ●  |  ●  |  ●  |  ●   |  ●  |
| `report.review`                |     |     |     |     |     |  ●  |     |     |  ●  |  ●   |  ◐  |
| `donation.make`                |     |  ●  |  ●  |  ●  |  ●  |  ●  |  ●  |  ●  |  ●  |  ●   |  ●  |
| `campaign.manage`              |     |     |     |     |     |     |  ●  |     |  ●  |  ●   |     |
| `donation.view_all`            |     |     |     |     |     |     |     |     |  ●  |  ●   |     |
| `analytics.view`               |     |     |     |     |     |     |  ○  |  ○  |  ●  |  ●   |     |
| `audit.read`                   |     |     |     |     |     |     |     |     |  ●  |  ●   |     |
| `system.configure`             |     |     |     |     |     |     |     |     |     |  ●   |     |
| `notification.read`            |     |  ●  |  ●  |  ●  |  ●  |  ●  |  ●  |  ●  |  ●  |  ●   |  ●  |
| `notification.replay`          |     |     |     |     |     |     |     |     |  ●  |  ●   |     |

## 5. Chapter-Scoped Grants
