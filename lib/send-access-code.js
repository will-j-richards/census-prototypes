import { NotifyClient } from 'notifications-node-client';

const recentAccessCodeSends = new Map();
const ACCESS_CODE_DEDUPE_MS = 15000;

function generateAccessCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 16; i += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code.match(/.{1,4}/g).join(' ');
}

/**
 * Send a census access-code SMS via GOV.UK Notify.
 * @param {string} phoneNumber
 * @returns {Promise<{ statusCode: number, body: Record<string, unknown> }>}
 */
export async function sendAccessCodeSms(phoneNumber) {
  const normalisedNumber = String(phoneNumber || '').trim();
  const notifyApiKey = process.env.NOTIFYAPIKEY;
  const notifySmsTemplateId = process.env.NOTIFY_SMS_TEMPLATE_ID;

  if (!normalisedNumber) {
    return { statusCode: 400, body: { error: 'Enter a mobile number' } };
  }

  if (!notifyApiKey) {
    return { statusCode: 500, body: { error: 'NOTIFYAPIKEY is not configured' } };
  }

  if (!notifySmsTemplateId) {
    return {
      statusCode: 500,
      body: {
        error:
          'NOTIFY_SMS_TEMPLATE_ID is not configured. Create an SMS template in GOV.UK Notify with ((access_code)) and add its ID.',
      },
    };
  }

  const now = Date.now();
  const lastSentAt = recentAccessCodeSends.get(normalisedNumber);
  if (lastSentAt && now - lastSentAt < ACCESS_CODE_DEDUPE_MS) {
    return { statusCode: 200, body: { ok: true, deduped: true } };
  }

  // Reserve immediately so parallel requests for the same number are skipped.
  recentAccessCodeSends.set(normalisedNumber, now);

  const notify = new NotifyClient(notifyApiKey);
  const accessCode = generateAccessCode();

  try {
    await notify.sendSms(notifySmsTemplateId, normalisedNumber, {
      personalisation: {
        access_code: accessCode,
      },
    });

    return { statusCode: 200, body: { ok: true } };
  } catch (error) {
    recentAccessCodeSends.delete(normalisedNumber);

    const notifyMessage =
      error?.response?.data?.errors?.[0]?.message || error?.message || 'Unable to send text message';

    console.error('GOV.UK Notify SMS failed:', notifyMessage);
    return { statusCode: 502, body: { error: notifyMessage } };
  }
}
