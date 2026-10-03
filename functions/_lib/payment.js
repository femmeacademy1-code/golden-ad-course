// Payment-processor adapter.
//
// The processor is not chosen yet (Grow / Cardcom / PayPlus / iCount), so this file is deliberately generic:
//  - buildPaymentUrl(): fills PAYMENT_URL_TEMPLATE (the hosted payment page link) with the student's details.
//  - parseWebhook():    reads the common field names these processors use for "our student id" and "transaction id".
// Once the processor is chosen, adjust the two functions below to its exact webhook format and verification.
import { HttpError } from './util.js';
import { safeEqual } from './crypto.js';

export function buildPaymentUrl(env, student) {
  const tpl = (env.PAYMENT_URL_TEMPLATE || '').trim();
  if (!tpl) return null;
  const vals = { id: student.id, email: student.email, name: student.name, phone: student.phone || '', amount: env.PRICE_ILS || '440' };
  return tpl.replace(/\{(id|email|name|phone|amount)\}/g, (_, k) => encodeURIComponent(vals[k]));
}

const pick = (o, keys) => { for (const k of keys) if (o && o[k] != null && o[k] !== '') return String(o[k]); return ''; };

export function verifyWebhook(env, request, body) {
  const secret = env.PAYMENT_WEBHOOK_SECRET;
  if (!secret) throw new HttpError(503, 'webhook secret not configured');
  const given = request.headers.get('x-webhook-secret') || new URL(request.url).searchParams.get('secret') || pick(body, ['secret']);
  if (!safeEqual(given, secret)) throw new HttpError(401, 'bad secret');
}

export function parseWebhook(body) {
  const status = pick(body, ['status', 'Status', 'statusCode', 'ResponseCode']).toLowerCase();
  const failed = ['failed', 'fail', 'error', 'declined', 'cancelled', 'canceled', '1', 'refunded'].includes(status);
  return {
    ok: !failed,
    studentId: pick(body, ['student_id', 'studentId', 'custom_field', 'customField', 'cField1', 'udf1', 'ReturnValue', 'MoreInfo']),
    email: pick(body, ['email', 'Email', 'payerEmail', 'client_email']).toLowerCase(),
    ref: pick(body, ['transaction_id', 'transactionId', 'TransactionId', 'asmachta', 'Asmachta', 'ref', 'InternalDealNumber', 'transactionToken']),
    amount: Math.round(Number(pick(body, ['amount', 'sum', 'Sum', 'Amount'])) || 0),
  };
}
