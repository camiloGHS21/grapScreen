import { createNodeLoader } from './n8n-node-loader.mjs';

const loader = await createNodeLoader('./.n8n-cache/src', { concurrency: 1 });
const res = await loader.load('packages/nodes-base/credentials/WhatsAppTriggerApi.credentials.ts');
console.log('ok:', res.ok);
if (res.ok) {
  console.log('description keys:', Object.keys(res.description || {}));
  console.log('description:', JSON.stringify(res.description, null, 2).slice(0, 500));
}
await loader.dispose();
