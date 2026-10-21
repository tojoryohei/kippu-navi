import { appendFileSync } from 'node:fs';
import { config } from './config.mjs';
appendFileSync(process.env.GITHUB_OUTPUT, `audience=${config(process.env.DEPLOY_ENVIRONMENT).serviceUrl}\n`);
