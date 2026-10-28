export const DOCS = [
  {
    slug: '01-architecture',
    title: 'The big picture',
    blurb: 'The four things OneGate can be in a single request — proxy, OpenID Provider, Relying Party and BFF — and the trust boundaries between them.',
    chapter: 'Foundations',
    minutes: 12,
  },
  {
    slug: '02-oidc-basics',
    title: 'OIDC & OAuth 2.0, the parts you need',
    blurb: 'Roles, endpoints, scopes, claims, PKCE, state, nonce, token anatomy and the exact order of a code flow. No hand-waving.',
    chapter: 'Foundations',
    minutes: 18,
  },
  {
    slug: '03-onegate-local-provider',
    title: 'Configuring the OneGate OpenID Provider',
    blurb: 'Every relevant setting from Local Providers, Realm Settings and Remote Clients, mapped to what it actually does at runtime.',
    chapter: 'OneGate configuration',
    minutes: 20,
  },
  {
    slug: '04-federation-rp-saml',
    title: 'Federation: RP, SAML IdP and SAML SP',
    blurb: 'OneGate as the hub between OIDC and SAML. Remote providers, local user mapping, NameID, AuthnContext and metadata.',
    chapter: 'OneGate configuration',
    minutes: 20,
  },
  {
    slug: '05-bff',
    title: 'Backend for Frontend, end to end',
    blurb: 'Why the BFF exists, every setting, the cookie and CSRF model, OneGate talking to itself, exchange and the debug trap.',
    chapter: 'OneGate configuration',
    minutes: 18,
  },
  {
    slug: '06-attribute-providers',
    title: 'Attribute providers & JVAP',
    blurb: 'The User Attribute API, subject/actor/ext, signed requests, JsonPath, caching and how PARM values become claims.',
    chapter: 'OneGate configuration',
    minutes: 15,
  },
  {
    slug: '07-tokens-and-lifecycle',
    title: 'Tokens, storage and lifetimes',
    blurb: 'JWT vs opaque, where each token may live, rotation, reuse detection, revocation and logout. Includes the storage risk matrix.',
    chapter: 'Deep dives',
    minutes: 16,
  },
  {
    slug: '08-server-to-server',
    title: 'Server-to-server & client credentials',
    blurb: 'Client ID + secret, Basic vs POST, audience design, caching, secret rotation and when to use token exchange instead.',
    chapter: 'Deep dives',
    minutes: 10,
  },
  {
    slug: '09-scenario-catalog',
    title: 'Scenario catalog & how to read the simulator',
    blurb: 'What every simulation teaches, which one to start with, and what all the colours, badges and vault entries mean.',
    chapter: 'Deep dives',
    minutes: 10,
  },
  {
    slug: '10-troubleshooting',
    title: 'Troubleshooting playbook',
    blurb: 'The error codes you will actually see, what causes them, and the order to check things in. Includes cookies, CORS and clocks.',
    chapter: 'Reference',
    minutes: 14,
  },
  {
    slug: 'glossary',
    title: 'Glossary',
    blurb: 'Every acronym in this lab, in one place, in plain language.',
    chapter: 'Reference',
    minutes: 8,
  },
];

export const CHAPTERS = ['Foundations', 'OneGate configuration', 'Deep dives', 'Reference'];

export const docBySlug = (slug) => DOCS.find((d) => d.slug === slug);

export const CATEGORIES = {
  foundation: { label: 'Foundations', blurb: 'The primitives, with no browser in the way.' },
  browser: { label: 'Browser apps', blurb: 'Public clients and what they can safely hold.' },
  bff: { label: 'BFF & sessions', blurb: 'Token-free browsers, cookies, exchange and logout.' },
  server: { label: 'Confidential apps', blurb: 'Server-side flows, secrets and refresh tokens.' },
  tokens: { label: 'Token design', blurb: 'Formats, audiences and validation.' },
  federation: { label: 'Federation', blurb: 'OneGate as RP for someone else\'s IdP.' },
  saml: { label: 'SAML', blurb: 'The same identity, in a signed XML envelope.' },
  attributes: { label: 'Attributes', blurb: 'JVAP / REST entitlements, caching and delegation.' },
  proxy: { label: 'Proxy & SSO', blurb: 'Protecting apps that know nothing about OIDC.' },
};

export const LEARNING_PATH = [
  '01-architecture',
  '02-oidc-basics',
  '07-tokens-and-lifecycle',
  '03-onegate-local-provider',
  '05-bff',
  '06-attribute-providers',
  '04-federation-rp-saml',
  '08-server-to-server',
  '09-scenario-catalog',
  '10-troubleshooting',
];
