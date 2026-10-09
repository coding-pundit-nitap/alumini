# Incident Communication Templates

Reliability. Post these on the status page, which is hosted off the production host. When the app is up but degraded, also post them as an in-app announcement.

- **Who posts:** the incident commander posts or delegates. For anything about donations, personal data or the institute's reputation, the institute liaison approves the wording first.
- **Each message says:** what is affected, what members should do, and when the next update will come. Leave out speculation, internal detail, blame and names of people.
- **Wording:** the liaison approves these templates before launch (OW-7).

Fill in the `<…>` parts and delete what does not apply. Times are IST.

## Investigating

Have this ready to send within one minute of a or being declared.

> **<Service or feature> is not working — investigating**
>
> Since <time> IST, <what members see: e.g. "signing in fails" / "the site does not load" / "messages are delayed">. We are investigating. <What members can do meanwhile, or "There is nothing you need to do.">
>
> Support for this service is staffed <coverage hours, e.g. "09:00–18:00 IST on working days">. Next update by <time> IST.

## Identified — mitigating

> **<Service or feature>: cause found, fix in progress**
>
> We have found the cause of <the problem> that began at <time> IST, and are <rolling back a recent change / restoring the service / working with our provider>. <Expected effect, without promising a time you cannot keep.>
>
> <Data: "No data has been lost." — only if that is established.> Next update by <time> IST.

## Monitoring

> **<Service or feature>: fixed, monitoring**
>
> <Feature> has been working normally since <time> IST. We are watching to make sure the fix holds. <If members need to act: "If you <did X> between <time> and <time>, please <do Y>.">
>
> Next update by <time> IST, or sooner if anything changes.

## Resolved

> **<Service or feature>: resolved**
>
> Between <start> and <end> IST, <what members experienced>. It was caused by <one plain sentence, no internal detail>. It is now resolved, and <what we are changing so it does not happen again, once the postmortem has decided>.
>
> <Action for members, if any.> We are sorry for the disruption.

## Security notice

Send this only after the liaison has approved it. The liaison also decides whether the institute must report the incident to authorities (CERT-In, the DPDP Act 2023). Runbook: [R-10](../../../ops/runbooks/R-10.md).

> **Security notice: <short description>**
>
> On <date>, we found that <what happened, in plain terms>, between <start> and <end>. It affected <which members, or "a small number of accounts">. The information involved was <data classes, e.g. "names and email addresses"; state clearly what was **not** involved, e.g. "passwords are stored hashed and were not exposed">.
>
> We have <contained it: e.g. "closed the vulnerability, signed out all sessions">. <Action for members: e.g. "Please reset your password using 'Forgot password' on the sign-in page. We will never ask for your password by email.">
>
> If you have questions, contact <alumni office contact>. We will post an update by <date>.
