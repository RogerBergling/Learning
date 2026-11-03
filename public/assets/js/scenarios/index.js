import { clientCredentials, tokenFormats } from './foundations.js';
import { spaPkce } from './browser.js';
import { webappConfidential, refreshRotation, multiAudience } from './server.js';
import { bffLogin, bffThirdParty, bffExchange, logout } from './bff.js';
import { fedOidcInbound, fedSamlIdp, fedSamlSp } from './federation.js';
import { attrRest, attrDelegation } from './attributes.js';
import { legacyProxySso } from './proxy.js';
import { controlCenterSetup } from './setup.js';
import { openidFederation } from './openid-federation.js';
import {
  dockerRun, dockerBuild, dockerCompose, dockerOps, dockerSecurity, dockerGhcr,
} from './docker.js';
import {
  gitFirstPush, gitBranchMerge, gitRebase, gitUndo, gitSecrets, gitRemotesAuth, gitReleaseGhcr,
} from './git.js';
import {
  haproxyHttpsRequest, haproxyAclRouting, haproxyTlsSni, haproxyHealth, haproxyTimeouts, haproxySecurity, haproxyUpgrade,
} from './haproxy.js';
import {
  esxtopBatchCapture, esxtopCpuReady, esxtopMemoryReclaim, esxtopStorageLatency,
  esxtopStorageQueue, esxtopNetworkDrops, esxtopFocusedRc, esxtopTriageReport,
} from './esxtop.js';

const FLOW = {
  'client-credentials': 'Service → token endpoint → API',
  'token-formats': 'App server → API → JWKS or introspection',
  'spa-pkce': 'Browser → OP → API (tokens in JavaScript)',
  'webapp-confidential': 'Browser ⇄ web tier ⇄ OneGate ⇄ API',
  'bff-login': 'Browser ⇄ BFF ⇄ OP → API (no tokens in browser)',
  'legacy-proxy-sso': 'Browser ⇄ proxy → legacy app',
  'refresh-rotation': 'App server ⇄ token endpoint (rotate + detect)',
  'multi-audience': 'One login → one token per API',
  'logout': 'BFF + SSO + logout',
  'bff-thirdparty': 'Browser → partner IdP → OneGate → API',
  'bff-exchange': 'Agent → BFF exchange → delegated token → API',
  'fed-oidc-inbound': 'Partner IdP → OneGate RP → proxy → legacy app',
  'fed-saml-sp': 'Partner IdP → OneGate SAML SP → local session',
  'fed-saml-idp': 'OneGate SAML IdP → partner SP',
  'attr-rest': 'User → profile → REST lookup → claims',
  'attr-delegation': 'Agent → actor lookup → delegated token',
  'control-center-setup': 'Control Center → Local Provider → RP → BFF → Web Resource',
  'openid-federation': 'RP ⇄ Trust Anchor ⇄ OP → trust chain → automatic client',
  'docker-run': 'CLI → Engine → Registry → Container → Volume',
  'docker-build': 'Context → BuildKit → Image → GHCR → Deployment',
  'docker-compose': 'compose.yaml → services → network/volume → update',
  'docker-ops': 'CLI → logs/exec/inspect → cleanup',
  'docker-security': 'Hardened image → container → runtime verification',
  'docker-ghcr': 'Tag → GHCR → pull → recreate → version stamp',
  'git-first-push': 'Working tree → index → commit → GitHub',
  'git-branch-merge': 'branch → commit → merge → push',
  'git-rebase': 'fetch → compare → rebase → push',
  'git-undo': 'working tree / index / history → recover',
  'git-secrets': 'stage → scan → ignore → rotate → history decision',
  'git-remotes-auth': 'SSH → fetch → pull/push → upstream',
  'git-release-ghcr': 'tag → Actions → GHCR → pull → verify',
  'haproxy-https-request': 'Client → TLS frontend → ACL → backend → server',
  'haproxy-acl-routing': 'Host/path ACLs → backend or 503',
  'haproxy-tls-sni': 'TCP/SNI edge ⇄ TLS termination',
  'haproxy-health': 'Health checks → balance → failover',
  'haproxy-timeouts': 'Queue/connect/response → 504 → logs',
  'haproxy-security': 'TLS + headers + trust boundaries',
  'haproxy-upgrade': 'Validate → reload → observe',
  'esxtop-batch-capture': 'SSH → batch CSV → parser → findings',
  'esxtop-cpu-ready': 'vCPU ready → limit/co-stop/contention → action',
  'esxtop-memory-reclaim': 'Guest memory → balloon/swap → NUMA',
  'esxtop-storage-latency': 'VM disk → vSCSI → HBA/LUN → DAVG/KAVG',
  'esxtop-storage-queue': 'Queue depth → latency → aborts/resets',
  'esxtop-network-drops': 'VM NIC → vSwitch → uplink → physical switch',
  'esxtop-focused-rc': 'Interactive → W rc → -c → large-capture sizing',
  'esxtop-triage-report': 'Findings → action plan → re-capture → report',
};

const ALL = [
  clientCredentials,
  tokenFormats,
  spaPkce,
  webappConfidential,
  bffLogin,
  legacyProxySso,
  refreshRotation,
  multiAudience,
  logout,
  bffThirdParty,
  bffExchange,
  fedOidcInbound,
  fedSamlSp,
  fedSamlIdp,
  attrRest,
  attrDelegation,
  controlCenterSetup,
  openidFederation,
  dockerRun,
  dockerBuild,
  dockerCompose,
  dockerOps,
  dockerSecurity,
  dockerGhcr,
  gitFirstPush,
  gitBranchMerge,
  gitRebase,
  gitUndo,
  gitSecrets,
  gitRemotesAuth,
  gitReleaseGhcr,
  haproxyHttpsRequest,
  haproxyAclRouting,
  haproxyTlsSni,
  haproxyHealth,
  haproxyTimeouts,
  haproxySecurity,
  haproxyUpgrade,
  esxtopBatchCapture,
  esxtopCpuReady,
  esxtopMemoryReclaim,
  esxtopStorageLatency,
  esxtopStorageQueue,
  esxtopNetworkDrops,
  esxtopFocusedRc,
  esxtopTriageReport,
];

const FEATURED = new Set([
  'bff-login', 'token-formats', 'webapp-confidential', 'attr-rest', 'openid-federation',
  'docker-run', 'docker-build', 'docker-compose', 'git-first-push', 'git-release-ghcr',
  'haproxy-https-request', 'haproxy-tls-sni',
  'esxtop-batch-capture', 'esxtop-cpu-ready', 'esxtop-storage-latency',
]);

export const SCENARIOS = ALL.map((s, i) => {
  const stepCount = s.variants
    ? Math.max(...Object.values(s.variants).map((v) => v.steps.length))
    : s.steps.length;
  const lengths = s.variants ? Object.values(s.variants).map((v) => v.steps.length) : [stepCount];
  const stepLabel = new Set(lengths).size > 1 ? `${Math.min(...lengths)}–${Math.max(...lengths)} steps` : `${stepCount} steps`;
  return {
    ...s,
    topic: s.topic || 'onegate',
    order: i + 1,
    stepCount,
    stepLabel,
    flow: FLOW[s.id] || '',
    featured: FEATURED.has(s.id),
    modes: s.variants ? Object.keys(s.variants) : null,
  };
});

export const scenarioById = (id) => SCENARIOS.find((s) => s.id === id) || null;

export const featuredScenarios = () => SCENARIOS.filter((s) => s.featured);

export const scenariosByTopic = (topic) => SCENARIOS.filter((s) => s.topic === topic);

export const categoryCounts = () => {
  const counts = {};
  for (const s of SCENARIOS) counts[s.category] = (counts[s.category] || 0) + 1;
  return counts;
};
