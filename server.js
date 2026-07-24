import 'dotenv/config';

import express from 'express';

import { sendAccessCodeSms } from './lib/send-access-code.js';
import createNunjucksEnvironment from '@ons/prototype-kit/lib/rendering/create-nunjucks-environment.js';
import { getSiteMap } from '@ons/prototype-kit/lib/rendering/helpers/site-map.js';
import installRenderHelpers from '@ons/prototype-kit/lib/rendering/install-render-helpers.js';
import renderPage from '@ons/prototype-kit/lib/rendering/render-page.js';

process.env.IS_DEV_SERVER = true;

const app = express();

app.use(express.json());

app.post('/api/send-access-code', async (req, res) => {
  const result = await sendAccessCodeSms(req.body?.phoneNumber);
  res.status(result.statusCode).json(result.body);
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
  if (!process.env.NOTIFYAPIKEY) {
    console.warn('NOTIFYAPIKEY is missing from .env — SMS sending is disabled');
  } else if (!process.env.NOTIFY_SMS_TEMPLATE_ID) {
    console.warn('NOTIFY_SMS_TEMPLATE_ID is missing from .env — SMS sending is disabled');
  }
});
