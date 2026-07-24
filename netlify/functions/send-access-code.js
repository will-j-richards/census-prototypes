import { sendAccessCodeSms } from '../../lib/send-access-code.js';

const jsonHeaders = {
  'Content-Type': 'application/json',
};

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: jsonHeaders,
      body: '',
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: jsonHeaders,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  let payload = {};
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (error) {
    return {
      statusCode: 400,
      headers: jsonHeaders,
      body: JSON.stringify({ error: 'Invalid JSON body' }),
    };
  }

  const result = await sendAccessCodeSms(payload.phoneNumber);

  return {
    statusCode: result.statusCode,
    headers: jsonHeaders,
    body: JSON.stringify(result.body),
  };
}
