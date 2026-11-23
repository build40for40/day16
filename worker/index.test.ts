import { afterEach, describe, expect, it, vi } from 'vitest'

import worker from './index'

const SECRET = 'whsec_test'
const env = {
  STRIPE_WEBHOOK_SECRET: SECRET,
  LULU_CLIENT_KEY: 'key',
  LULU_CLIENT_SECRET: 'secret',
  POSTMARK_SERVER_TOKEN: 'postmark',
  LULU_API_URL: 'https://api.sandbox.lulu.com',
  LULU_POD_PACKAGE_ID: '0600X0900.BW.STD.PB.060UW444.MXX',
  LULU_INTERIOR_URL: 'https://files.example/interior.pdf',
  LULU_COVER_URL: 'https://files.example/cover.pdf',
  LULU_CONTACT_EMAIL: 'team@example.com',
} as Parameters<typeof worker.fetch>[1]

const session = (overrides = {}) => ({
  id: 'cs_test_123',
  payment_status: 'paid',
  metadata: { app: 'day16' },
  customer_details: { email: 'reader@example.com', phone: '+442079460000' },
  collected_information: {
    shipping_details: {
      name: 'Ada Reader',
      address: { line1: '1 Test Street', line2: null, city: 'London', state: 'Greater London', postal_code: 'N1 9GU', country: 'GB' },
    },
  },
  ...overrides,
})

async function deliver(object: object, { livemode = false, signature }: { livemode?: boolean; signature?: string } = {}) {
  const body = JSON.stringify({ type: 'checkout.session.completed', livemode, data: { object } })
  const timestamp = Math.floor(Date.now() / 1000)
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signed = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${body}`))
  const hex = [...new Uint8Array(signed)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
  const request = new Request('https://build40for40.com/seasoned/api/stripe/webhook', {
    method: 'POST',
    headers: { 'Stripe-Signature': `t=${timestamp},v1=${signature ?? hex}` },
    body,
  })
  return worker.fetch(request as never, env)
}

function lulu({ existing = [] as object[], created = Response.json({ id: 77 }, { status: 201 }) } = {}) {
  const calls: { url: string; body: any }[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined })
      if (url.includes('postmarkapp.com')) return Response.json({ MessageID: 'sent' })
      if (url.includes('/openid-connect/token')) return Response.json({ access_token: 'token' })
      if (init?.method === 'POST') return created
      return Response.json({ results: existing })
    }),
  )
  return calls
}

afterEach(() => vi.unstubAllGlobals())

describe('the Stripe webhook', () => {
  it('turns a paid book order into a Lulu print job', async () => {
    const calls = lulu()

    const response = await deliver(session())

    expect(response.status).toBe(200)
    expect(await response.text()).toBe('Ordered: print job 77.')
    const order = calls.find((call) => call.url.endsWith('/print-jobs/'))!
    expect(order.url).toBe('https://api.sandbox.lulu.com/print-jobs/')
    expect(order.body).toMatchObject({
      external_id: 'cs_test_123',
      shipping_level: 'MAIL',
      shipping_address: {
        name: 'Ada Reader',
        street1: '1 Test Street',
        city: 'London',
        state_code: 'Greater London',
        postcode: 'N1 9GU',
        country_code: 'GB',
        phone_number: '+442079460000',
        email: 'reader@example.com',
      },
    })
    expect(calls.find((call) => call.url.includes('postmarkapp.com'))!.body).toMatchObject({
      To: 'reader@example.com',
      Subject: 'Your copy of Seasoned is off to the printer',
    })
  })

  it('does not print the same order twice', async () => {
    const calls = lulu({ existing: [{ id: 41, external_id: 'cs_test_123' }] })

    const response = await deliver(session())

    expect(await response.text()).toBe('Already ordered: print job 41.')
    expect(calls.some((call) => call.body)).toBe(false)
  })

  it('leaves payments for anything else alone', async () => {
    const calls = lulu()

    const response = await deliver(session({ metadata: { day: '3' } }))

    expect(response.status).toBe(200)
    expect(calls).toHaveLength(0)
  })

  it('fails the delivery when Lulu turns the order down', async () => {
    lulu({ created: Response.json({ shipping_address: ['Too long.'] }, { status: 400 }) })

    const response = await deliver(session())

    expect(response.status).toBe(502)
    expect(await response.text()).toContain('Too long.')
  })

  it('refuses a live order while Lulu is the sandbox', async () => {
    const calls = lulu()

    const response = await deliver(session(), { livemode: true })

    expect(response.status).toBe(503)
    expect(calls).toHaveLength(0)
  })

  it('rejects a bad signature', async () => {
    const response = await deliver(session(), { signature: '0'.repeat(64) })

    expect(response.status).toBe(400)
  })
})

describe('the Lulu webhook', () => {
  const shipped = {
    topic: 'PRINT_JOB_STATUS_CHANGED',
    data: {
      external_id: 'cs_test_123',
      status: { name: 'SHIPPED' },
      line_items: [{ tracking_urls: ['https://track.example/abc'] }],
      shipping_address: { name: 'Ada Reader', email: 'reader@example.com' },
    },
  }

  async function notify(payload: object, secret = 'secret') {
    const body = JSON.stringify(payload)
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    const signed = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body))
    const hex = [...new Uint8Array(signed)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
    const request = new Request('https://build40for40.com/seasoned/api/lulu/webhook', { method: 'POST', headers: { 'Lulu-HMAC-SHA256': hex }, body })
    return worker.fetch(request as never, env)
  }

  it('emails the reader a tracking link when the book ships', async () => {
    const calls = lulu()

    const response = await notify(shipped)

    expect(response.status).toBe(200)
    expect(calls).toHaveLength(1)
    expect(calls[0]!.body).toMatchObject({ To: 'reader@example.com', Subject: 'Seasoned is in the post' })
    expect(calls[0]!.body.TextBody).toContain('https://track.example/abc')
  })

  it('says nothing for other status changes', async () => {
    const calls = lulu()

    await notify({ ...shipped, data: { ...shipped.data, status: { name: 'IN_PRODUCTION' } } })

    expect(calls).toHaveLength(0)
  })

  it('rejects a payload signed with the wrong secret', async () => {
    const response = await notify(shipped, 'someone-else')

    expect(response.status).toBe(400)
  })
})
