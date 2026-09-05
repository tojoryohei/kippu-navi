import { readFileSync } from 'node:fs';

const config = JSON.parse(readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8'));
const target = config.env.staging.name;
const account = process.env.CLOUDFLARE_ACCOUNT_ID;
const token = process.env.CLOUDFLARE_API_TOKEN;
if (!account || !token) throw new Error('Cloudflare account ID and API token are required.');

async function get(path) {
  const response = await fetch(`https://api.cloudflare.com/client/v4/${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await response.json();
  if (!response.ok || !data.success) {
    throw new Error(`Cloudflare preflight failed (${response.status}): ${JSON.stringify(data.errors)}`);
  }
  return data.result;
}

const domains = await get(`accounts/${account}/workers/domains`);
const staging = domains.find(domain => domain.hostname === 'stg.kippu-navi.com');
if (!staging || staging.service !== target) {
  throw new Error(`stg.kippu-navi.com must already belong to ${target}; stop before changing a domain assignment.`);
}
const otherDomains = domains.filter(domain => domain.service === target && domain.hostname !== staging.hostname);
if (otherDomains.length) {
  throw new Error(`Refusing to deploy to a Worker serving other domains: ${otherDomains.map(domain => domain.hostname).join(', ')}`);
}
const routes = await get(`zones/${staging.zone_id}/workers/routes`);
const otherRoutes = routes.filter(route => route.script === target &&
  !route.pattern.replace(/^https?:\/\//, '').startsWith('stg.kippu-navi.com/'));
if (otherRoutes.length) {
  throw new Error(`Refusing to deploy to a Worker with other routes: ${otherRoutes.map(route => route.pattern).join(', ')}`);
}
console.log(`Verified staging-only target: ${target} → ${staging.hostname}`);
const production = domains.find(domain => domain.hostname === 'kippu-navi.com');
console.log(`Production custom domain: ${production?.service || 'not registered as a Worker Custom Domain'} (unchanged)`);

// Read-only inventory helps identify a second CI system that could overwrite this deployment.
try {
  const workers = await get(`accounts/${account}/workers/scripts`);
  const worker = workers.find(worker => worker.id === target);
  if (worker?.tag) {
    const triggers = await get(`accounts/${account}/builds/workers/${worker.tag}/triggers`);
    console.log('Cloudflare Builds triggers:', JSON.stringify(triggers.map(trigger => ({
      name: trigger.trigger_name,
      branches: trigger.branch_includes,
      excludedBranches: trigger.branch_excludes,
      buildCommand: trigger.build_command,
      deployCommand: trigger.deploy_command,
    }))));
  }
} catch (error) {
  console.warn(`Could not inspect optional Cloudflare Builds settings: ${error.message}`);
}
