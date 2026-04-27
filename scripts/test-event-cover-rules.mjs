import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')
const assert = (condition, message) => {
  if (!condition) throw new Error(message)
}

const eventCover = read('components/EventCover.tsx')
assert(eventCover.includes('aspect-video'), 'EventCover must enforce a 16:9 aspect ratio')
assert(eventCover.includes('object-cover'), 'EventCover image must use object-fit: cover')
assert(eventCover.includes('object-center'), 'EventCover image must default to centered cropping')
assert(eventCover.includes('className={cn('), 'EventCover must allow callers to vary size while keeping 16:9')

const listPage = read('app/(public)/events/public/PublicEventsClient.tsx')
assert(listPage.includes('<EventCover'), 'public events list must use EventCover')
assert(!listPage.includes('relative w-full h-44 overflow-hidden'), 'public events list must not hard-code banner height')

const detailPage = read('app/(public)/events/public/[eventId]/EventDetailClient.tsx')
assert(detailPage.includes('<EventCover'), 'public event detail must use EventCover')
assert(!detailPage.includes('h-56 md:h-72 object-cover'), 'public event detail must not hard-code banner height')

const applyPage = read('app/apply/[eventId]/ApplyClient.tsx')
assert(applyPage.includes('<EventCover'), 'apply page must use EventCover')
assert(!applyPage.includes('aspect-[3/1]'), 'apply page must not use 3:1 event cover ratio')

const votePage = read('app/vote/[eventId]/VoteClient.tsx')
assert(votePage.includes('<EventCover'), 'vote page must use EventCover')
assert(!votePage.includes('max-h-48'), 'vote page must not cap banner height in a way that breaks 16:9')

const dashboardList = read('app/(dashboard)/events/EventsPageClient.tsx')
assert(dashboardList.includes('<EventCover'), 'dashboard events list must use EventCover')

const reviewList = read('app/(dashboard)/my-reviews/page.tsx')
assert(reviewList.includes('<EventCover'), 'reviewer events list must use EventCover')

const dashboardDetail = read('app/(dashboard)/events/[id]/EventDetailClient.tsx')
assert(dashboardDetail.includes('<EventCover'), 'dashboard event detail banner must use EventCover')

const zh = read('lib/i18n/zh.ts')
const en = read('lib/i18n/en.ts')
assert(zh.includes('建议上传 16:9 活动封面图，推荐尺寸 1600 × 900'), 'Chinese upload hint must mention 16:9 and 1600 × 900')
assert(en.includes('16:9 event cover image') && en.includes('1600 × 900'), 'English upload hint must mention 16:9 and 1600 × 900')

console.log('event cover rules ok')
