import { defineConfig } from '@playwright/test';
import common from './playwright.config.mjs';
process.env.VEYRA_TEST_CLOUDFLARE = '1';
const base = process.env.VEYRA_TEST_BASE || 'http://127.0.0.1:3104';
export default defineConfig({
  ...common,
  use:{ ...common.use, baseURL:base },
  webServer:process.env.VEYRA_TEST_BASE ? undefined : {
    command:'npm run dev:cloudflare -- --ip 127.0.0.1 --port 3104 --persist-to .test-data/cloudflare-browser',
    url:base+'/healthz', reuseExistingServer:false, timeout:45000,
    env:{ WRANGLER_SEND_METRICS:'false', BROWSER:'none' },
  },
});
