import { CSS, ICONS, SEASONS, page, seasonIndex, sideOf } from '../pages/page'
import type { RecipeFile } from '../pages/page'

const SITE = '/seasoned'

export interface Assets {
  ASSETS: { fetch(input: Request | string): Promise<Response> }
}

// The day turns over at midnight in London, wherever the reader is.
export function londonDay(now: Date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now)
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value ?? '00'
  const key = `${part('month')}-${part('day')}`
  return {
    // The book has 365 pages, so 29 February reads the 28th again.
    key: key === '02-29' ? '02-28' : key,
    secondsLeft: 86400 - (Number(part('hour')) * 3600 + Number(part('minute')) * 60 + Number(part('second'))),
  }
}

export async function today(request: Request, env: Assets, now = new Date()) {
  const { key, secondsLeft } = londonDay(now)
  const stored = await env.ASSETS.fetch(new URL(`${SITE}/recipes/${key}.json`, request.url).toString())
  if (!stored.ok) return Response.json({ error: `No recipe for ${key}.` }, { status: 404 })

  const file = (await stored.json()) as RecipeFile
  const { slot, recipe } = file
  return Response.json(
    {
      key,
      day: slot.day,
      label: slot.label,
      title: recipe.title,
      form: recipe.dish_form,
      ingredients: recipe.ingredients.length,
      season: SEASONS[seasonIndex(slot.month)],
      unlocks_in: secondsLeft,
      css: CSS,
      html: ICONS + page(file, `pictures/${key}.jpg`, sideOf(slot.day, 'right')),
    },
    { headers: { 'Cache-Control': 'public, max-age=60' } },
  )
}

export async function picture(request: Request, env: Assets, now = new Date()) {
  const { pathname } = new URL(request.url)
  if (pathname !== `${SITE}/pictures/${londonDay(now).key}.jpg`) return new Response('Not found', { status: 404 })
  return env.ASSETS.fetch(request)
}
