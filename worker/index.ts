interface Env {
  STRIPE_WEBHOOK_SECRET?: string
  LULU_CLIENT_KEY?: string
  LULU_CLIENT_SECRET?: string
  LULU_API_URL: string
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

const API = '/seasoned/api'
const BOOK = 'day16'

const text = (body: string, status: number) => new Response(body, { status })
const encoder = new TextEncoder()

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url)
    if (request.method === 'POST' && pathname === `${API}/stripe/webhook`) return stripeWebhook(request, env)
    return text('Not found', 404)
  },
} satisfies ExportedHandler<Env>

// https://docs.stripe.com/webhooks#verify-manually
async function verifyStripe(body: string, header: string | null, secret: string) {
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
  if (!env.STRIPE_WEBHOOK_SECRET || !env.LULU_CLIENT_KEY || !env.LULU_CLIENT_SECRET) return text("Secrets aren't set.", 500)

  const body = await request.text()
  if (!(await verifyStripe(body, request.headers.get('Stripe-Signature'), env.STRIPE_WEBHOOK_SECRET))) return text('Bad signature.', 400)

  const event = JSON.parse(body) as CheckoutSessionEvent
  const session = event.data.object
  // Bank-style payments complete unpaid and confirm later with async_payment_succeeded.
  const paid =
    event.type === 'checkout.session.async_payment_succeeded' ||
    (event.type === 'checkout.session.completed' && session.payment_status === 'paid')
  if (!paid || session.metadata?.app !== BOOK) return text('Ignored.', 200)

  const printsForReal = new URL(env.LULU_API_URL).host === 'api.lulu.com'
  if (event.livemode && !printsForReal) return text('A live order arrived while Lulu is set to its sandbox.', 503)
  if (!event.livemode && printsForReal) return text('Ignored: a test payment never prints a real book.', 200)

  const order = printJob(session, env)
  if (!order) return text('The session has no shipping address, phone or email.', 422)

  try {
    const token = await luluToken(env)
    const placed = await lulu<{ results: { id: number; external_id: string | null }[] }>(
      env,
      token,
      `print-jobs/?exclude_line_items=true&search=${encodeURIComponent(session.id)}`,
    )
    const existing = placed.results.find((job) => job.external_id === session.id)
    if (existing) return text(`Already ordered: print job ${existing.id}.`, 200)

    const job = await lulu<{ id: number }>(env, token, 'print-jobs/', order)
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
      // Stripe sends a code where Lulu needs one (US, CA, AU) and a county or province name elsewhere, which Lulu rejects.
      state_code: /^[A-Z]{2,3}$/.test(address.state ?? '') ? address.state! : undefined,
      postcode: address.postal_code,
      country_code: address.country,
      phone_number: phone,
      email,
    },
  }
}

class LuluError extends Error {}

async function luluToken(env: Env) {
  const response = await fetch(`${env.LULU_API_URL}/auth/realms/glasstree/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${btoa(`${env.LULU_CLIENT_KEY}:${env.LULU_CLIENT_SECRET}`)}` },
    body: new URLSearchParams({ grant_type: 'client_credentials' }),
  })
  if (!response.ok) throw new LuluError(`Lulu refused the API key (${response.status}).`)
  return ((await response.json()) as { access_token: string }).access_token
}

async function lulu<T>(env: Env, token: string, path: string, body?: unknown) {
  const response = await fetch(`${env.LULU_API_URL}/${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!response.ok) throw new LuluError(`Lulu answered ${response.status}: ${(await response.text()).slice(0, 1000)}`)
  return (await response.json()) as T
}
