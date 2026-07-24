import 'dotenv/config';

import express from 'express';
import { NotifyClient } from 'notifications-node-client';

import createNunjucksEnvironment from '@ons/prototype-kit/lib/rendering/create-nunjucks-environment.js';
import { getSiteMap } from '@ons/prototype-kit/lib/rendering/helpers/site-map.js';
import installRenderHelpers from '@ons/prototype-kit/lib/rendering/install-render-helpers.js';
import renderPage from '@ons/prototype-kit/lib/rendering/render-page.js';

process.env.IS_DEV_SERVER = true;

const app = express();
const notifyApiKey = process.env.NOTIFYAPIKEY;
const notifySmsTemplateId = process.env.NOTIFY_SMS_TEMPLATE_ID;
const notify = notifyApiKey ? new NotifyClient(notifyApiKey) : null;

function generateAccessCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 16; i += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

app.use(express.json());

app.post('/api/send-access-code', async (req, res) => {
  const phoneNumber = String(req.body?.phoneNumber || '').trim();

  if (!phoneNumber) {
    res.status(400).json({ error: 'Enter a mobile number' });
    return;
  }

  if (!notify || !notifyApiKey) {
    res.status(500).json({ error: 'NOTIFYAPIKEY is not configured in .env' });
    return;
  }

  if (!notifySmsTemplateId) {
    res.status(500).json({
      error: 'NOTIFY_SMS_TEMPLATE_ID is not configured in .env. Create an SMS template in GOV.UK Notify with ((access_code)) and add its ID.',
    });
    return;
  }

  const accessCode = generateAccessCode();

  try {
    await notify.sendSms(notifySmsTemplateId, phoneNumber, {
      personalisation: {
        access_code: accessCode,
      },
    });

    res.json({ ok: true });
  } catch (error) {
    const notifyMessage =
      error?.response?.data?.errors?.[0]?.message ||
      error?.message ||
      'Unable to send text message';

    console.error('GOV.UK Notify SMS failed:', notifyMessage);
    res.status(502).json({ error: notifyMessage });
  }
});

app.use((req, res, next) => {
  const internalRequestPath = (req.path ?? '/').substr(1);
  let rawRequestPath = internalRequestPath;
  if (rawRequestPath !== '' && !rawRequestPath.endsWith('/')) {
    rawRequestPath += '/';
  }

  const siteMap = getSiteMap();

  const requestAttempts = [
    `${internalRequestPath}`,
    `${internalRequestPath}.html`,
    !!rawRequestPath ? `${rawRequestPath}index.html` : 'index.html',
  ];

  const requestEntryUrl = requestAttempts.find((attempt) => siteMap.routes.has(attempt));
  const requestEntry = siteMap.routes.get(requestEntryUrl);
  if (!requestEntry) {
    next();
    return;
  }

  const nunjucksEnvironment = createNunjucksEnvironment(null, requestEntry.version);
  installRenderHelpers(nunjucksEnvironment);

  const output = renderPage(requestEntry.templatePath, nunjucksEnvironment);
  res.send(output);
});

app.use(express.static('./build'));

app.listen(3010, () => {
  console.log('Prototype server listening on http://localhost:3010');
  if (!notifyApiKey) {
    console.warn('NOTIFYAPIKEY is missing from .env — SMS sending is disabled');
  } else if (!notifySmsTemplateId) {
    console.warn('NOTIFY_SMS_TEMPLATE_ID is missing from .env — SMS sending is disabled');
  }
});
