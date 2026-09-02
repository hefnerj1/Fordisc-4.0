# FORDISC 4.0.3 — TouchNet Purchase and Manual Clerk Provisioning

## Purpose

FORDISC 4.0.3 uses the University of Tennessee TouchNet store for purchasing while Clerk remains the identity, organization, and authorization system. The initial production launch is invitation-only. A completed TouchNet order is verified by an authorized fulfiller, then the corresponding private Clerk metadata is added manually.

This is an interim fulfillment workflow. It does not create an automated TouchNet integration or webhook.

## TouchNet store

```text
https://secure.touchnet.com/C21610_ustores/web/store_main.jsp?STOREID=15&SINGLESTORE=true
```

The public application displays one **Purchase Access Through UTK** button on the opening page and the signed-in Plans page. Plan cards are informational and do not start separate Clerk checkouts.

## Account-activation message

The application tells purchasers:

> After purchase, your FORDISC username and password will be supplied by email. Account setup may take up to 24 hours.

## Required controls

- Verify that the TouchNet transaction is completed before granting access.
- Match the order to the exact Clerk user or Clerk Organization.
- Store entitlement data only in Clerk **private metadata**.
- Never place card numbers, bank information, CVV values, or other payment credentials in Clerk, FORDISC, email, or the fulfillment register.
- Every paid entitlement must have an explicit UTC `valid_until` date.
- Use `status: "active"` only after payment and eligibility are verified.
- Use **Refresh access** in FORDISC after metadata is changed.
- Keep a separate, access-controlled fulfillment register for reconciliation.

## Student subscription

Student access belongs on the individual Clerk user. The user must also have a verified qualifying institutional email under the existing Student eligibility rules.

Recommended Clerk user private metadata:

```json
{
  "fd4_subscription": {
    "tier": "student",
    "status": "active",
    "source": "touchnet",
    "valid_from": "2026-09-01T00:00:00Z",
    "valid_until": "2027-09-01T00:00:00Z",
    "reference": "TOUCHNET-ORDER-REFERENCE"
  }
}
```

If the subscription record is active but the verified institutional email requirement is not satisfied, FORDISC does not grant Student access.

## Pro subscription

Pro access belongs on the individual Clerk user.

Recommended Clerk user private metadata:

```json
{
  "fd4_subscription": {
    "tier": "pro",
    "status": "active",
    "source": "touchnet",
    "valid_from": "2026-09-01T00:00:00Z",
    "valid_until": "2027-09-01T00:00:00Z",
    "reference": "TOUCHNET-ORDER-REFERENCE"
  }
}
```

## Institution subscription

Institution access belongs on the Clerk Organization, not on the purchaser’s individual user record. The initial plan includes 15 named users. The Organization membership limit should be set to the purchased total when Clerk configuration permits it.

Recommended Clerk Organization private metadata:

```json
{
  "fd4_subscription": {
    "tier": "institution",
    "status": "active",
    "source": "touchnet",
    "valid_from": "2026-09-01T00:00:00Z",
    "valid_until": "2027-09-01T00:00:00Z",
    "seat_limit": 15,
    "reference": "TOUCHNET-ORDER-REFERENCE"
  }
}
```

Additional named users may be added only after an approved additional-user purchase or administrative authorization. Update `seat_limit` to the total purchased limit. Public additional-user pricing is currently **price TBD**.

## Supported values

### `tier`

The short canonical values remain recommended:

User private metadata:

```text
student
pro
```

Organization private metadata:

```text
institution
```

FORDISC 4.0.3 also accepts the corresponding supported plan aliases so that an administrator may paste an existing Clerk plan slug without silently losing access. Underscores and hyphens are normalized.

Student aliases:

```text
student
fd4_student_access
fd4-student-access
fordisc-student
```

Pro aliases:

```text
pro
fd4_app_access
fd4-app-access
fordisc-pro
```

Institution aliases:

```text
institution
institutional
fordisc-institution
fordisc-institutional
```

All recognized aliases are converted internally to `student`, `pro`, or `institution`. A tier placed on the wrong scope is still rejected.

### `status`

The authorization server grants access only for:

```text
active
```

Recommended non-access statuses include:

```text
pending
expired
revoked
refunded
suspended
cancelled
```

Any value other than `active` is treated as inactive.

### `source`

Use:

```text
touchnet
```

The source is included in the sanitized authorization summary. The order reference value is not returned to the browser; the response reports only whether a reference is present.

### `valid_from`

Optional. If supplied, it must be a valid ISO 8601 date/time and must not be in the future when access is checked.

### `valid_until`

Required for manual paid access. It must be a valid ISO 8601 date/time in the future. An omitted, invalid, or expired date does not grant access.

### `seat_limit`

Used for institutional records. It must be a positive integer. Membership enforcement and administrative reconciliation remain operational responsibilities during the manual phase.

## Fulfillment workflow

1. Invite or locate the intended Clerk Production user.
2. For Student, confirm the verified qualifying institutional email.
3. Confirm the completed TouchNet order and selected product.
4. Confirm that the purchaser email and intended Clerk account or Organization match.
5. Add or update `private_metadata.fd4_subscription` using the appropriate example above.
6. For Institution, create or identify the Clerk Organization, set the authorized member limit, and invite the designated administrator.
7. Ask the user to sign in and select **Refresh access**.
8. Confirm the FORDISC access label and expiration date on the Plans page. If access is not granted, use the diagnostic displayed there to correct the tier, status, dates, Clerk scope, or Student email verification.
9. Record fulfillment in the controlled Subscription Fulfillment Register.
10. Send the account credentials or activation notice. Complete this process within 24 hours when possible.

## Renewal

After a verified renewal, extend `valid_until` to the new end date. Preserve the current tier and scope unless the customer purchased a different plan. Update the order reference and fulfillment register as appropriate.

## Refund, chargeback, or revocation

Set `status` to the applicable inactive value, such as `refunded` or `revoked`, and select **Refresh access** or wait for the short authorization cache to expire. Do not delete the record if an audit trail is required; use the fulfillment register for the complete administrative history.

## Expiration

No manual action is required to stop access at the end of the term. The backend evaluates `valid_until` on authorization refresh and automatically falls back to the next valid entitlement or Fordisc Free.

## Beta and administrator overrides

The existing explicit `fd4_access` private-metadata values remain available for approved beta testers and administrators:

```text
admin
beta
beta-tester
beta_tester
```

These overrides grant full access and take precedence over paid-entitlement evaluation. Do not use them for ordinary paying subscribers.

## Subscription Fulfillment Register

Maintain an access-controlled register with only necessary operational fields, for example:

- TouchNet order reference
- purchaser email
- Clerk user ID or Organization ID
- plan tier
- payment-confirmation date
- access start and expiration
- institution seat limit
- provisioning date
- fulfiller
- renewal, refund, chargeback, suspension, or revocation status

Do not record payment-card or bank-account data.

## Production checklist

- Clerk Production instance created for `fordisc.com`.
- Production Clerk keys and authorized parties configured in Render.
- TouchNet product names and prices confirmed.
- UTK staff roles for order verification and fulfillment assigned.
- Production support email confirmed as `fordisc.support@gmail.com`.
- Final Terms, privacy notice, refund/cancellation policy, and acceptance process approved.
- Institutional additional-user price and maximum finalized.
- Test purchases completed for Student, Pro, Institution, renewal, refund, and expiration.
