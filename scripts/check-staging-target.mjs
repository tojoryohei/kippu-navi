import { readFileSync } from 'node:fs';

function parseJsonc(source) {
  let withoutComments = '';
  let inString = false;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const nextCharacter = source[index + 1];

    if (lineComment) {
      if (character === '\n') {
        lineComment = false;
        withoutComments += character;
      }
      continue;
    }

    if (blockComment) {
      if (character === '*' && nextCharacter === '/') {
        blockComment = false;
        index += 1;
      } else if (character === '\n') {
        withoutComments += character;
      }
      continue;
    }

    if (inString) {
      withoutComments += character;
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }

    if (character === '"') {
      inString = true;
      withoutComments += character;
    } else if (character === '/' && nextCharacter === '/') {
      lineComment = true;
      index += 1;
    } else if (character === '/' && nextCharacter === '*') {
      blockComment = true;
      index += 1;
    } else {
      withoutComments += character;
    }
  }

  let json = '';
  inString = false;
  escaped = false;
  for (let index = 0; index < withoutComments.length; index += 1) {
    const character = withoutComments[index];

    if (inString) {
      json += character;
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }

    if (character === '"') {
      inString = true;
      json += character;
      continue;
    }

    if (character === ',') {
      let nextIndex = index + 1;
      while (/\s/.test(withoutComments[nextIndex] ?? '')) nextIndex += 1;
      if (withoutComments[nextIndex] === '}' || withoutComments[nextIndex] === ']') {
        index = nextIndex - 1;
        continue;
      }
    }

    json += character;
  }

  return JSON.parse(json);
}

const config = parseJsonc(readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8'));
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
const staging = domains.find(domain => domain.hostname === 'staging.kippu-navi.com');
if (!staging || staging.service !== target) {
  throw new Error(`staging.kippu-navi.com must already belong to ${target}; stop before changing a domain assignment.`);
}
const otherDomains = domains.filter(domain => domain.service === target && domain.hostname !== staging.hostname);
if (otherDomains.length) {
  throw new Error(`Refusing to deploy to a Worker serving other domains: ${otherDomains.map(domain => domain.hostname).join(', ')}`);
}
const routes = await get(`zones/${staging.zone_id}/workers/routes`);
const otherRoutes = routes.filter(route => route.script === target &&
  !route.pattern.replace(/^https?:\/\//, '').startsWith('staging.kippu-navi.com/'));
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
