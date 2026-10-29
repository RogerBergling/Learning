# The Control Center, end to end

Every other chapter in this lab explains a protocol. This one explains **where the settings live**. It follows the structure of the **OneGate Administration Manual**, which is itself organised as a tour of Control Center — because in OneGate the configuration is the architecture.

> Availability warning from the manual: the settings you see depend on the **ACL for Control Center** and on the **installed licence**. A missing menu item is usually a permission or licence decision, not a bug.

## The shape of the product

Control Center is the web-based administration interface. The manual divides it into seven areas:

| Area | What it holds |
|---|---|
| **Virtual Host Selector** | Which virtual host you are editing |
| **Monitoring** | Status, licence, sessions, logs, statistics, reports, supervision |
| **Administration** | Users and groups, resources (Web Resource, tunnel, RDP, SSH), ACL, caching, menus |
| **Server Settings** | Host, network, DNS, frontend, certificates, cookies, visual profile |
| **Authentication** | Methods, user directories, attribute sources, password policy, PKI, RADIUS |
| **Federation** | Attribute profiles, SAML IdP, SAML SP, OpenID Connect, OpenID Connect RP |
| **Maintenance** | Files, backup, install/upgrade, documentation, **Activate Changes** |

The names matter. Much confusion in older material — including earlier versions of this lab — comes from inventing objects that OneGate does not have. The manual’s vocabulary is: **Local Providers**, **Realm Settings**, **Remote Clients**, **RP Authentication**, **Remote Providers**, **Backend For Frontend**, **Attribute Sources**, **Remote Service Providers**, **Local Service Providers**, **Remote IDPs**, **Attribute Profiles**, **Access Control Lists (ACL)**, **Virtual Host Selector** and **Activate Changes**.

## 1. Virtual Host Selector

The selector is at the **top left**. It chooses which virtual host is being configured.

The manual’s description is worth quoting in spirit: virtual hosts let OneGate act like **two or more separate servers** — separate URLs, separate user databases, separate configurations — while sharing one wildcard certificate.

Two consequences:

- Almost every setting you edit is scoped to the selected virtual host.
- The selector is **only visible once at least one virtual host exists**. A single-host deployment may never show it.

“I changed the setting and nothing happened” is very often “I changed it on the wrong virtual host”. Check the selector before you debug anything else.

## 2. Monitoring

Monitoring is read-mostly. It answers “is it healthy, who is logged in, and what happened?”.

| Section | What it gives you |
|---|---|
| **Status** | Version, start time, system load, active sessions, cluster nodes, platform, certificate information |
| **License** | Licence state and usage |
| **Sessions** | Current sessions, including per-resource users |
| **View Logs** | Server and access logs |
| **Statistics** | Counters and trends |
| **Reports / User Reports** | Generated reports |
| **Monitoring Settings** | Log settings, supervision, user notification |
| **Appliance Registration** | Registration of the appliance |

For this lab, the useful habit is: when a login fails, look at **Sessions** and **View Logs** before changing configuration. The failure is usually visible as “no session created” or “session created but not accepted by the resource”.

## 3. Administration

### Users and Groups

OneGate can use its **local database**, an external **LDAP** directory, or a **Graph API** directory. The manual is explicit that the split changes what you administer in Control Center:

| Function | Local database | External LDAP |
|---|---|---|
| Initiate a user | N/A | OneGate |
| Create / change / remove a user | OneGate | Via the directory |
| Create / erase a group | OneGate | Via the directory |
| Change group membership | OneGate | Via the directory |
| Allow SMS / Web authentication | OneGate | OneGate |

If your users come from AD, do not expect to edit them in Control Center.

### User Services and Resources

**Administration → User Services** is where protected things are published. The resource types mirror what people actually need:

| Resource type | Use |
|---|---|
| **Web Resource** | HTTP/HTTPS application behind the OneGate reverse proxy |
| **Tunnel Resource** | TCP service reached through a tunnel |
| **Windows Share** | SMB file share |
| **RDP Resource** | Remote Desktop |
| **SSH Resource** | SSH |

#### Web Resource

This is the object behind the [legacy proxy scenario](#/sim/legacy-proxy-sso). The manual’s tabs:

**Main Settings**

| Setting | Meaning |
|---|---|
| **Description** | Shown to the user, e.g. on the SSO Handler page |
| **Type** | The internal server is HTTP or HTTPS |
| **Server Address** | IP address or DNS name of the internal server |
| **Port** | Port on the internal server |
| **Hostnames** | Optional `Host:` value(s), comma separated, for name-based virtual hosting |
| **Logout URI** | Called when the user logs out or the session times out |
| **Reversed proxy** | Normal mode for HTTP/HTTPS resources |
| **Simple SID Proxy** | For third-party programs; the session ID appears in the URL — use with care |
| **SSL Tunnel** | Dynamic tunnel; URLs are translated to `localhost` |
| **Check Connectivity / View Current Users** | Diagnostics |

**Advanced Settings** — the long tail: pattern pool, parameter rewrite, content types, user-agent override, encoding, socket timeout, WebSockets, pipelining, cookie pass-through, `_top` translation, request/response rewriting, unknown headers.

Two fields matter repeatedly in this lab:

| Setting | Meaning |
|---|---|
| **Send Custom Headers** | Sends configured headers to the web resource. **Custom headers always start with `X`** — in Control Center you enter the name **without** the `X-` prefix. `USERID` becomes `X-USERID`. |
| **Allow Unknown Headers** | Lets unknown headers pass between client and server. The manual notes: **headers starting with `X` are never passed from the client.** That is what stops a browser from spoofing the identity header. |

**SSO Settings** — the authentication type. **`Normal` means there is no resource-specific SSO**; the resource is protected by ordinary OneGate authentication plus its ACL. Other types exist for specific products and protocols (SiteVision, Force Basic, Static NTLM, form-based, Kerberos SSO, eSign). There is no “resource SSO = BFF” option — the BFF is a separate feature, in the Federation menu.

### Access Control (ACL)

Authorization is done with **Access Control Lists**. The manual lists the usual dimensions: **group, IP address, date and time, and authentication method**.

Important details:

- A resource **without ACL rules** is type “Not Configured” and is **not accessible** to users. There is no accidental allow.
- Federation resources have extra ACL fields: **Local IDP** and **Remote SP** for SAML, and **Providers** for OpenID.
- The same ACL section also protects **Control Center itself** — via an access list and **Access profiles** for sections within it. Misconfiguring this can lock you out.
- Password administration and user self-service functions (FIDO, OATH, YubiKey, password change, VPN, etc.) are authorised the same way.

For a Web Resource, the practical model is: **normal authentication creates the session, the ACL decides whether this user may reach this resource, and custom headers tell the app who arrived**.

### Cache Control, Menu Entries, SSO Entries, Cookie Store

| Section | Purpose |
|---|---|
| **Cache Control** | Per-resource caching. The manual notes that changing Cache Control for the `mg-local` resource requires **Reindex files**. |
| **Menu Entries** | The user-facing menu: inline navigator, autostart, dynamic entries, ordering |
| **SSO Entries** | Stored credentials for SSO flows that need them |
| **Cookie Store** | Cookies OneGate keeps on the user’s behalf for proxied resources |
| **VPN Settings** | VPN resources |

The **Client Handling** section (address pools, timeout settings, user agents, tunnel client) and **Self Service** (password reset) and **Data Center** (IP restrictions) round out Administration.

## 4. Server Settings

Server Settings is infrastructure, not identity. The manual’s groups:

| Group | Contains |
|---|---|
| **General Settings** | Global host settings, virtual-host settings, SSL, date/time, node settings, network connection tests, console menu, SMS, URL converter, virtual hosts, system message, rate limits, schedule, offline keys, logout settings |
| **Web Settings** | HSTS, CORS preflight responses, request filters, server cookies, `X-Frame-Options`, behaviormetry, resource headers |
| **Frontend Settings** | Headers profiles, frontend configuration, certificates, domains |
| **Network Settings** | DNS client/server, DNS test, interfaces, routes, virtual IPs |
| **Visual Profile** | Visual settings, images, colours, themes, page layouts |

Several of these show up in this lab’s troubleshooting chapter:

- **HSTS** — forces HTTPS; a misconfigured `max-age`, `includeSubDomains` or `preload` is hard to undo.
- **Preflight Response** — the CORS preflight answer for a resource, including `Access-Control-Allow-Origin`, methods, headers, credentials and exposed headers. “CORS error” is often a missing preflight entry here, not a bug in the app.
- **Request Filters** — reject or skip specific requests; can create mysterious 404s after login if overused.
- **Server Cookies** — flags for cookies OneGate sets, including `Secure`, `HttpOnly` and `SameSite`.
- **Virtual Hosts** — the definitions the Virtual Host Selector chooses between, including the wildcard certificate model.

## 5. Authentication

Authentication is broader than OIDC. The manual groups it as:

### Methods

- **Active Methods** — which methods users may use (Web Token, SMS Token, YubiKey, Kerberos, RADIUS, FIDO2, etc.).
- **Special Methods** — methods with special behaviour.
- **Authentication Backends** — where the method gets its data.
- **Method Chains** — require several methods in sequence.
- **Method Groups** — group methods for policy and ACL matching.

If a method is not enabled, users cannot log in with it and it is not shown on the login page.

### Account Handling

| Section | Purpose |
|---|---|
| **Active User Directory** | Local database, LDAP or Graph API |
| **Database Settings** | Local user database |
| **Graph API Settings** | Microsoft Graph directory |
| **Virtual Groups** | Groups computed from attributes rather than stored membership |
| **Attribute Sources** | LDAP, REST and Graph attribute enrichment |
| **Password Policy** | Length, complexity, history, lockout |

#### Attribute Sources

This is the manual’s name for what earlier lab text called “JVAP”. The source types are **LDAP**, **REST** and **Graph API**. A REST source is the **User Attribute API** contract:

```json
{
  "realm": "corp",
  "subject": "roger.lind",
  "actor": { "subject": "agent-2231" },
  "requested_attributes": ["department", "roles"],
  "ext": { "caseId": "CASE-10442" }
}
```

Key settings: **Description**, **Log out user on fail**, **Type**, **API URL**, request method, connect/read timeout, **Skip SSL Check**, **Realm**, **Subject**, **Actor**, **Ext**, **Include Access Token** (with claim `iss`, `aud`, `sub` and the sign/encrypt **Key**), **Valid time**, and the attribute list (**Attribute Name**, **JsonPath**, **Friendly Name** — GUI-only).

There is no separate “JVAP product”. See [attribute sources](#/learn/06-attribute-providers) for the full walkthrough.

### Account Creation, Method Options, PKI, VPN, RADIUS

Templates, dialogs and filters for account creation; OTP, Enigma, YubiKey, RADIUS client, ticket resolver, Kerberos, persistent login, OATH and FIDO2 options; CA settings, providers, backends and signature policies; VPN authenticator settings; RADIUS profiles. None of this is required to understand the OIDC flows, but it is where “the user authenticated, but not with the method the ACL expected” gets fixed.

## 6. Federation

Federation is where this lab spends most of its time. The manual’s structure:

```
Federation
├── Federation Settings
│   └── Attribute Profiles
├── SAML IDP
│   ├── Local Identity Providers (IDPs)
│   ├── Active local IDPs
│   ├── Remote Service Providers
│   ├── Remote SP groups
│   ├── Metadata Providers
│   └── IDP AuthnContexts → AuthnContext mapping / Method mapping
├── SAML SP
│   ├── Local Service Providers (SPs)
│   ├── Remote IDPs
│   ├── Active remote IDPs
│   └── Method mapping
├── OpenID Connect
│   ├── Local Providers
│   │   ├── General Settings
│   │   ├── Advanced Settings
│   │   ├── Provider Settings
│   │   ├── Key Settings
│   │   ├── Realm Settings
│   │   └── Remote Clients
│   └── (Remote Providers live under OpenID Connect RP)
└── OpenID Connect RP
    ├── RP Authentication
    ├── Remote Providers
    └── Backend For Frontend
```

### OpenID Connect — Local Providers

OneGate as OP. The manual’s sub-tabs:

| Tab | What it controls |
|---|---|
| **General Settings** | Description, Virtual Host Domain, unique **Realm**, generated Discovery URL, Metadata |
| **Advanced Settings** | PKCE metadata (`code_challenge_methods_supported`), display values, claims supported |
| **Provider Settings** | **Access Token Type**, access / ID token lifetimes, refresh-token behaviour |
| **Key Settings** | RSA 2048/3072/4096, x5c certificate, self-signed x5c, `x5t` / `x5t#S256`, and the **No EdDSA key** / **No EC key** / **No encryption keys** switches |
| **Realm Settings** | Virtual-host enablement, **Default Attribute Profile**, **Access Token Attribute Profile**, **ID Token Attribute Profile**, allowed Remote Clients |
| **Remote Clients** | One entry per application |

The refresh settings are explicit in the manual: **Refresh token lifetime**, **Refresh token total lifetime**, **Refresh token max idle**, **Update refresh token**, **Reuse detection**, **Reuse grace period (sec)** and **Issue id token**.

### OpenID Connect — Remote Clients

| Field | Meaning |
|---|---|
| **Description** | Name of the client |
| **redirect_uris** | Comma-separated whitelist; the incoming `redirect_uri` is matched against it |
| **scope** | Space separated; `openid` is mandatory |
| **response_types** | Use `code`; implicit and hybrid are discouraged |
| **grant_types** | `authorization_code` is required for the code flow |
| **token_endpoint_auth_signing_alg** | Recommended `RS256` |
| **client_id / client_secret** | The client authenticates with both at the token endpoint |
| **id_token_signed_response_alg / userinfo_signed_response_alg** | Recommended `RS256` |
| **Local properties for claims** | Available as `PARM{oidcclient.NAME}` during claim evaluation |
| **Session Properties** | Extra session attributes |
| **Access Token JWT** | **Default resource (`aud`)**, **Allowed resources from parameter**, **Resource indicator from scope** |

The redirect whitelist is a security control. Prefer exact URIs. Wildcards are possible but must still include a scheme and domain, and should be scoped as tightly as possible.

### OpenID Connect RP — Remote Providers and RP Authentication

| Object | Purpose |
|---|---|
| **Remote Providers** | The external OP: Description, **Manually configured** or **Use Discovery URL**, connect/read timeout, **Skip SSL check**, Discovery URL, manual metadata (`issuer`, `authorization_endpoint`, `token_endpoint`, `userinfo_endpoint`, `jwks_uri`, `subject_types_supported`) |
| **RP Authentication** | The RP config that points at a Remote Provider: Description, **Unique Name** (also forms the callback), **Virtual Host Domain**, **Remote Provider**, **scope**, **response_types**, **token_endpoint_auth_method**, **client_id / client_secret**, **id_token_signed_response_alg**, **prompt**, **Local user handling**, **Handle unknown users**, **Session Properties** |

The RP can point at a partner OP **or at OneGate’s own Local Provider**. That second case is how the BFF works.

### Backend For Frontend

The manual describes the BFF as the way an SPA without its own backend can use APIs behind the OneGate proxy **without exposing access tokens to the app or the user agent**. After authentication, OneGate issues a special **BFF cookie** (`sameSite` + `httpOnly`), validates it on later requests, and adds a bearer access token server-side.

| Setting | Meaning |
|---|---|
| **Description** | Name of the BFF config |
| **Realm** | URL-safe path segment; **domain + realm must be unique** |
| **Limit for domains** | Must be empty or one or more comma-separated domains; **domain + realm must be unique** |
| **RP Authentication** | The OpenID remote provider used to authenticate the user |
| **Local Provider** | The local OIDC provider that issues the tokens |
| **Remote Client** | The client used when issuing the tokens |
| **Client Redirect URIs** | Comma-separated list; each string is matched against the **beginning** of the login-start `redirect_uri` |
| **Logout URL** | Returned by `/mg-local/(realm)/bff/logout` after the session is logged out |
| **Authenticate users from tokens** | **On** for a third-party OP; **off** when the same OneGate is the OP |
| **Enable AT Endpoint (debug)** | Exposes `/mg-local/(realm)/bff/accessToken`; testing only — it voids the point of the BFF |
| **CSRF Token header name** | Suggested `X-CSRFTOKEN` |
| **Initial subject / ext / audience / realm** | Initial `PARM{bffN.*}` values after login |
| **Default exchange ext / audience / realm** | Fallbacks when an exchange request omits them |
| **Actor claims** | Claims copied from the original token into `act`; the user’s `sub` is always added |

Only two BFF endpoints are named by the manual: **`/mg-local/(realm)/bff/logout`** and **`/mg-local/(realm)/bff/accessToken`**. Login, callback and exchange paths in this lab are illustrative.

### SAML

The two SAML directions use different objects, and the names are easy to mix up:

| Direction | OneGate object | Remote object |
|---|---|---|
| OneGate issues assertions | **SAML IDP → Local Identity Providers** | **Remote Service Providers** (the SPs that trust you) |
| OneGate consumes assertions | **SAML SP → Local Service Providers** | **Remote IDPs** (the IdPs you trust) |

Supporting objects: **Active local IDPs**, **Active remote IDPs**, **Remote SP groups**, **Metadata Providers**, **AuthnContext mapping** and **Method mapping**.

Two manual rules worth memorising:

- Inbound SAML requires at least one **Method mapping** whose **Map Pattern** matches the remote IDP’s authentication method; otherwise users cannot log in.
- **Strict Check** adds the strict SubjectConfirmationData and Conditions requirements (`InResponseTo`, `NotOnOrAfter`, `Recipient`, `AudienceRestriction`). Turning it off is a compatibility decision, not a convenience.

### Attribute Profiles

**Federation → Federation Settings → Attribute Profiles** is where local values become claims. Both OIDC and SAML use it.

Two principles from the manual:

1. **Every claim must be mapped** in an attribute profile to return a value. Adding a claim to a scope without mapping it returns nothing.
2. **Prefer mapping over computing.** Attribute profiles can call simple functions (`function:substring(...)` appears in the manual’s own example), but complex derivation belongs in an **Attribute Source**. Map the result.

A profile entry is usually a `PARM{...}` reference:

```
given_name: PARM{givenname}
name:       PARM{givenname} PARM{surname}
department: PARM{attr-0.attributes.department}
sub:        PARM{oidcclient.sub}
```

## 7. Maintenance and Activate Changes

Maintenance contains **Files**, **Backup**, **Install / Upgrade**, **Documentation** and **Activate Changes**.

This is the single most important operational rule in the manual:

> **Any change to OneGate’s configuration must be activated to work.**

| Action | What it does | When to use |
|---|---|---|
| **Reload configuration** | Reloads configuration files and activates changes; logged-in users stay logged in | After almost every setting change |
| **Reindex files** | Rebuilds the index of files users can access | After adding or changing files under `server/` or its subdirectories, or after changing Cache Control for `mg-local` |
| **Restart service** | Restarts the OneGate service | Network changes, new certificates, anything the reload cannot pick up |
| **Reboot** | Reboots the server | Rarely needed |
| **Shut Down** | Powers off the appliance | Disconnects and logs out everyone, including the administrator |

A saved setting that “did nothing” is usually one of: wrong virtual host, no **Reload configuration**, or a file change without **Reindex files**.

## 8. The order that avoids pain

1. **Virtual Host Selector** — confirm the host.
2. **Authentication** — user directory, methods, attribute sources.
3. **Federation → Attribute Profiles** — decide the claim vocabulary.
4. **Federation → OpenID Connect → Local Providers** — realm, metadata, provider settings, keys.
5. **Realm Settings** — bind the provider to the virtual host and choose the three attribute profiles.
6. **Remote Clients** — one per application, tight redirect whitelist.
7. **OpenID Connect RP** — Remote Provider, RP Authentication.
8. **Backend For Frontend** — only if you need one.
9. **Administration → User Services → Web Resource** — publish the app; set the ACL and custom headers.
10. **Activate Changes → Reload configuration**.
11. Test: login, token, API call, refresh, logout. Read **Monitoring → Sessions / View Logs** when it fails.

## 9. What the manual does not document

Be careful not to turn a generic OIDC expectation into a OneGate feature claim. The Administration Manual does **not** describe:

- the **client credentials** grant or any machine-to-machine grant;
- a **token introspection** endpoint or its settings;
- a **token revocation** endpoint (RFC 7009);
- **OIDC back-channel logout**;
- a **`token_endpoint_auth_method = none`** public-client option;
- a **consent** screen or consent configuration;
- a **“PKCE required”** enforcement switch (PKCE appears as metadata capability);
- exact login / callback / exchange paths for the BFF beyond logout and accessToken.

Those may exist in your version or licence. Verify before designing around them. Where this lab uses one of them, the chapter says so and treats it as generic OAuth/OIDC background.

## Simulate it

- [Control Center setup](#/sim/control-center-setup) — the same order, animated, ending at Activate Changes.
- [Legacy proxy SSO](#/sim/legacy-proxy-sso) — Web Resource + ACL + `X-USERID`.
- [BFF login](#/sim/bff-login) — Local Provider + Remote Client + RP + BFF.
- [Attribute source](#/sim/attr-rest) — the REST contract behind the settings.

Next: [Glossary](#/glossary).
