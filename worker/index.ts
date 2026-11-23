interface Env {
  STRIPE_WEBHOOK_SECRET?: string
  STRIPE_SANDBOX_WEBHOOK_SECRET?: string
  LULU_CLIENT_KEY?: string
  LULU_CLIENT_SECRET?: string
  LULU_SANDBOX_CLIENT_KEY?: string
  LULU_SANDBOX_CLIENT_SECRET?: string
  POSTMARK_SERVER_TOKEN?: string
  LULU_POD_PACKAGE_ID: string
  LULU_INTERIOR_URL: string
  LULU_COVER_URL: string
  LULU_CONTACT_EMAIL: string
}

interface Address {
  line1: string | null
  line2: string | null
  city: string | null
  state: string | null
  postal_code: string | null
  country: string | null
}

interface ShippingDetails {
  name: string | null
  address: Address | null
}

interface CheckoutSession {
  id: string
  payment_status: 'paid' | 'unpaid' | 'no_payment_required'
  metadata: Record<string, string> | null
  customer_details: { email: string | null; phone: string | null } | null
  collected_information?: { shipping_details: ShippingDetails | null } | null
  shipping_details?: ShippingDetails | null
}

interface CheckoutSessionEvent {
  type: string
  livemode: boolean
  data: { object: CheckoutSession }
}

interface PrintJobEvent {
  topic: string
  data: {
    external_id?: string | null
    status?: { name: string; line_item_statuses?: { messages?: { tracking_urls?: string[] } }[] }
    line_items?: { tracking_urls?: string[] | null }[]
    shipping_address?: { name?: string; email?: string }
  }
}

const API = '/seasoned/api'
const BOOK = 'day16'

interface Lulu {
  api: string
  key?: string
  secret?: string
}

// A live Stripe payment prints a real book. A sandbox payment only ever reaches Lulu's sandbox.
const luluFor = (env: Env, live: boolean): Lulu =>
  live
    ? { api: 'https://api.lulu.com', key: env.LULU_CLIENT_KEY, secret: env.LULU_CLIENT_SECRET }
    : { api: 'https://api.sandbox.lulu.com', key: env.LULU_SANDBOX_CLIENT_KEY, secret: env.LULU_SANDBOX_CLIENT_SECRET }

const text = (body: string, status: number) => new Response(body, { status })
const encoder = new TextEncoder()

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url)
    if (request.method === 'POST' && pathname === `${API}/stripe/webhook`) return stripeWebhook(request, env)
    if (request.method === 'POST' && pathname === `${API}/lulu/webhook`) return luluWebhook(request, env)
    return text('Not found', 404)
  },
} satisfies ExportedHandler<Env>

// https://docs.stripe.com/webhooks#verify-manually
async function verifyStripe(body: string, header: string | null, secret?: string) {
  if (!secret) return false
  const parts = (header ?? '').split(',').map((part) => part.split('='))
  const timestamp = Number(parts.find(([key]) => key === 't')?.[1])
  const signatures = parts.filter(([key, value]) => key === 'v1' && /^[0-9a-f]{64}$/.test(value ?? '')).map(([, value]) => value!)
  if (!signatures.length || !(Math.abs(Date.now() / 1000 - timestamp) <= 300)) return false

  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'])
  for (const signature of signatures) {
    const bytes = new Uint8Array(signature.match(/../g)!.map((byte) => parseInt(byte, 16)))
    if (await crypto.subtle.verify('HMAC', key, bytes, encoder.encode(`${timestamp}.${body}`))) return true
  }
  return false
}

// Every failure answers Stripe with an error status, so the order shows as a failed delivery in the Stripe dashboard
// and is retried, instead of a paid book quietly never being printed.
async function stripeWebhook(request: Request, env: Env) {
  const body = await request.text()
  const signature = request.headers.get('Stripe-Signature')
  const live = await verifyStripe(body, signature, env.STRIPE_WEBHOOK_SECRET)
  if (!live && !(await verifyStripe(body, signature, env.STRIPE_SANDBOX_WEBHOOK_SECRET))) return text('Bad signature.', 400)

  const event = JSON.parse(body) as CheckoutSessionEvent
  if (event.livemode !== live) return text('Bad signature.', 400)
  const session = event.data.object
  // Bank-style payments complete unpaid and confirm later with async_payment_succeeded.
  const paid =
    event.type === 'checkout.session.async_payment_succeeded' ||
    (event.type === 'checkout.session.completed' && session.payment_status === 'paid')
  if (!paid || session.metadata?.app !== BOOK) return text('Ignored.', 200)

  const account = luluFor(env, live)
  if (!account.key || !account.secret) return text(`Lulu's ${live ? 'production' : 'sandbox'} keys aren't set.`, 503)

  const order = printJob(session, env)
  if (!order) return text('The session has no shipping address, phone or email.', 422)

  try {
    const token = await luluToken(account)
    const placed = await lulu<{ results: { id: number; external_id: string | null }[] }>(
      account,
      token,
      `print-jobs/?exclude_line_items=true&search=${encodeURIComponent(session.id)}`,
    )
    const existing = placed.results.find((job) => job.external_id === session.id)
    if (existing) return text(`Already ordered: print job ${existing.id}.`, 200)

    const job = await lulu<{ id: number }>(account, token, 'print-jobs/', order)
    await email(
      env,
      order.shipping_address,
      'Your copy of Seasoned is off to the printer',
      "Thanks for buying Seasoned. Your copy is being printed just for you, which takes a few days, then it goes in the post. We'll email you again the moment it ships.",
    )
    return text(`Ordered: print job ${job.id}.`, 200)
  } catch (error) {
    if (error instanceof LuluError) return text(error.message, 502)
    throw error
  }
}

function printJob(session: CheckoutSession, env: Env) {
  const shipping = session.collected_information?.shipping_details ?? session.shipping_details
  const address = shipping?.address
  const { email, phone } = session.customer_details ?? {}
  if (!shipping?.name || !address?.line1 || !address.city || !address.postal_code || !address.country || !phone || !email) return null

  return {
    external_id: session.id,
    contact_email: env.LULU_CONTACT_EMAIL,
    shipping_level: 'MAIL',
    line_items: [
      {
        title: 'Seasoned',
        quantity: 1,
        printable_normalization: {
          pod_package_id: env.LULU_POD_PACKAGE_ID,
          interior: { source_url: env.LULU_INTERIOR_URL },
          cover: { source_url: env.LULU_COVER_URL },
        },
      },
    ],
    shipping_address: {
      name: shipping.name,
      street1: address.line1,
      street2: address.line2 ?? undefined,
      city: address.city,
      state_code: address.state ?? undefined,
      postcode: address.postal_code,
      country_code: address.country,
      phone_number: phone,
      email,
    },
  }
}

async function luluWebhook(request: Request, env: Env) {
  const body = await request.text()
  const sent = request.headers.get('Lulu-HMAC-SHA256')
  const signed = await Promise.all([env.LULU_CLIENT_SECRET, env.LULU_SANDBOX_CLIENT_SECRET].map((secret) => verifyLulu(body, sent, secret)))
  if (!signed.includes(true)) return text('Bad signature.', 400)

  const { topic, data } = JSON.parse(body) as PrintJobEvent
  const reader = data.shipping_address
  const ours = data.external_id?.startsWith('cs_')
  if (topic !== 'PRINT_JOB_STATUS_CHANGED' || data.status?.name !== 'SHIPPED' || !ours || !reader?.email) return text('Ignored.', 200)

  const links = new Set([
    ...(data.line_items ?? []).flatMap((item) => item.tracking_urls ?? []),
    ...(data.status.line_item_statuses ?? []).flatMap((item) => item.messages?.tracking_urls ?? []),
  ])
  const tracking = links.size ? `\n\nFollow it here:\n${[...links].join('\n')}` : ''
  // Always a 200: Lulu switches the webhook off after five failed deliveries in a row.
  await email(env, reader, 'Seasoned is in the post', `Your book has left the printer and is on its way to you.${tracking}`)
  return text('Emailed.', 200)
}

async function verifyLulu(body: string, sent: string | null, secret?: string) {
  if (!secret) return false
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const digest = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(body)))
  const hex = [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('')
  // Lulu's docs don't say which encoding the header uses.
  return sent === hex || sent === btoa(String.fromCharCode(...digest))
}

async function email(env: Env, to: { name?: string; email?: string }, subject: string, message: string) {
  if (!env.POSTMARK_SERVER_TOKEN) return
  const hello = to.name ? `Hi ${to.name.split(' ')[0]},\n\n` : ''
  const response = await fetch('https://api.postmarkapp.com/email', {
    method: 'POST',
    headers: { 'X-Postmark-Server-Token': env.POSTMARK_SERVER_TOKEN, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      From: 'Seasoned <noreply@build40for40.com>',
      ReplyTo: 'help@build40for40.com',
      To: to.email,
      Subject: subject,
      TextBody: `${hello}${message}\n\nAny trouble, just reply to this email.\n\nLawrence, Samira and Ben\n40 for 40`,
      MessageStream: 'outbound',
    }),
  })
  if (!response.ok) console.error(`Postmark answered ${response.status} for "${subject}": ${await response.text()}`)
}

class LuluError extends Error {}

async function luluToken(account: Lulu) {
  const response = await fetch(`${account.api}/auth/realms/glasstree/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${btoa(`${account.key}:${account.secret}`)}` },
    body: new URLSearchParams({ grant_type: 'client_credentials' }),
  })
  if (!response.ok) throw new LuluError(`Lulu refused the API key (${response.status}).`)
  return ((await response.json()) as { access_token: string }).access_token
}

async function lulu<T>(account: Lulu, token: string, path: string, body?: unknown) {
  const response = await fetch(`${account.api}/${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!response.ok) throw new LuluError(`Lulu answered ${response.status}: ${(await response.text()).slice(0, 1000)}`)
  return (await response.json()) as T
}
