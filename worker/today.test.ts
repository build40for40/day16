import { describe, expect, it, vi } from 'vitest'

import { londonDay, picture, today } from './today'

const file = {
  slot: { day: 327, label: '23 November', month: 11 },
  recipe: {
    title: 'Leek & potato soup',
    dish_form: 'soup',
    utensils: ['a large pan'],
    prep_minutes: 10,
    cook_minutes: 25,
    time_note: '',
    seasoning: [{ id: 'thyme', name: 'thyme' }],
    ingredients: [
      { id: 'leeks', quantity: '3', name: 'leeks' },
      { id: 'potatoes', quantity: '500g', name: 'potatoes' },
    ],
    steps: ['Soften the leeks.', 'Simmer with the potatoes.'],
  },
}

const assets = (found = true) => ({
  ASSETS: { fetch: vi.fn(async () => (found ? Response.json(file) : new Response('Not found', { status: 404 }))) },
})

const evening = new Date('2026-11-23T23:10:00Z')

describe('the London day', () => {
  it('turns over at midnight in London, not UTC', () => {
    expect(londonDay(new Date('2026-07-14T23:30:00Z')).key).toBe('07-15')
    expect(londonDay(evening)).toEqual({ key: '11-23', secondsLeft: 3000 })
  })

  it('reads 28 February again on a leap day', () => {
    expect(londonDay(new Date('2028-02-29T12:00:00Z')).key).toBe('02-28')
  })
})

describe("today's recipe", () => {
  it("answers with today's page from the stored recipes", async () => {
    const env = assets()
    const response = await today(new Request('https://example.com/seasoned/api/today'), env, evening)
    const body = (await response.json()) as Record<string, unknown>

    expect(env.ASSETS.fetch).toHaveBeenCalledWith('https://example.com/seasoned/recipes/11-23.json')
    expect(body).toMatchObject({ key: '11-23', day: 327, label: '23 November', form: 'soup', ingredients: 2, season: 'autumn', unlocks_in: 3000 })
    expect(body.html).toContain('Leek &amp; potato soup')
    expect(body.html).toContain('src="pictures/11-23.jpg"')
  })

  it('answers 404 when the day has no recipe', async () => {
    const response = await today(new Request('https://example.com/seasoned/api/today'), assets(false), evening)
    expect(response.status).toBe(404)
  })
})

describe('the pictures', () => {
  it("serves today's picture and keeps every other day's back", async () => {
    const env = assets()
    const todays = await picture(new Request('https://example.com/seasoned/pictures/11-23.jpg'), env, evening)
    const tomorrows = await picture(new Request('https://example.com/seasoned/pictures/11-24.jpg'), env, evening)

    expect(todays.status).toBe(200)
    expect(tomorrows.status).toBe(404)
    expect(env.ASSETS.fetch).toHaveBeenCalledTimes(1)
  })
})
