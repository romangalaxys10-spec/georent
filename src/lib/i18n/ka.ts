import type { Dictionary } from './types';

/**
 * Georgian (ქართული) dictionary.
 *
 * Keys are locked to the English source of truth via `Dictionary` — missing
 * or extra keys fail `tsc`. Placeholders like {n} / {total} are filled at
 * render time by simple string replacement; keep them verbatim.
 * Parity is re-checked at runtime by `scripts/check-i18n.ts`.
 */
export const dict: Dictionary = {
  'app.name': 'DealRadar Georgia',
  'app.tagline': 'დაიჭირე საუკეთესო ბინის შეთავაზებები საქართველოში, სანამ სხვები მოასწრებენ',

  'nav.explore': 'ძებნა',
  'nav.alerts': 'განგაში',
  'nav.feed': 'შეტყობინებები',
  'nav.sources': 'წყაროები',

  'hero.title': 'იყავი ერთი ნაბიჯით წინ საქართველოს უძრავი ქონების ბაზარზე',
  'hero.subtitle':
    'korter.ge-ს ახალი განცხადებებისა და ფასების კლების ცოცხალი მონიტორინგი — შენს პირობებს მორგებული, გამოჩენისთანავე შენთან მიწოდებული.',
  'hero.cta': 'შექმენი შენი პირველი განგაში',
  'hero.browse': 'ნახე აქტიური განცხადებები',

  'filters.title': 'ძებნის პარამეტრები',
  'filters.budget': 'ბიუჯეტი (USD)',
  'filters.from': 'დან',
  'filters.to': 'მდე',
  'filters.city': 'ქალაქი',
  'filters.districts': 'უბნები',
  'filters.anyDistrict': 'ნებისმიერი უბანი',
  'filters.rooms': 'ოთახები',
  'filters.anyRooms': 'ნებისმიერი',
  'filters.area': 'ფართობი (მ²)',
  'filters.apply': 'გამოყენება',
  'filters.reset': 'გასუფთავება',
  'filters.sort': 'დალაგება',
  'filters.sortNewest': 'ჯერ ახალი',
  'filters.sortCheapest': 'ჯერ იაფი',
  'filters.sortPriceDrop': 'საუკეთესო გარიგების ქულა',
  'filters.sortPpsm': 'ფასი მ²-ზე',

  'listing.new': 'ახალი',
  'listing.priceDrop': 'ფასის კლება',
  'listing.bumped': 'განახლებული',
  'listing.perm2': '/მ²',
  'listing.view': 'ნახვა Korter-ზე',
  'listing.floor': 'სართული {n}/{total}',
  'listing.dealScore': 'გარიგების ქულა',
  'listing.scoreExcellent': 'შესანიშნავი',
  'listing.scoreGood': 'კარგი',
  'listing.scoreFair': 'საშუალო',
  'listing.scorePricey': 'ძვირი',
  'listing.warmingUp': 'მონაცემები გროვდება',
  'listing.studio': 'სტუდიო',

  'alerts.create': 'განგაშის შექმნა',
  'alerts.edit': 'განგაშის რედაქტირება',
  'alerts.name': 'განგაშის სახელი',
  'alerts.namePlaceholder': 'მაგ. ვაკე, ოროთახიანი, 90 000 დოლარამდე',
  'alerts.myAlerts': 'ჩემი განგაშები',
  'alerts.none': 'განგაში ჯერ არ გაქვს — შექმენი ერთი და დაიწყე შეთავაზებების დაჭერა',
  'alerts.delete': 'წაშლა',
  'alerts.confirmDelete': 'წავშალო ეს განგაში?',
  'alerts.active': 'აქტიური',
  'alerts.paused': 'პაუზაზე',
  'alerts.matches': 'დამთხვევა',
  'alerts.pause': 'პაუზა',
  'alerts.resume': 'გაგრძელება',
  'alerts.notifyBrowser': 'ბრაუზერის შეტყობინებები',
  'alerts.notifySound': 'ხმა',
  'alerts.saved': 'განგაში შენახულია',
  'alerts.deleted': 'განგაში წაშლილია',

  'feed.title': 'ცოცხალი შეტყობინებები',
  'feed.markAllRead': 'ყველას წაკითხულად მონიშვნა',
  'feed.empty': 'ჯერ არაფერია. როგორც კი განცხადება შენს განგაშს დაემთხვევა, აქ პირველი გამოჩნდება.',
  'feed.justNow': 'ახლახანს',
  'feed.minAgo': '{n} წთ-ის წინ',
  'feed.hourAgo': '{n} სთ-ის წინ',
  'feed.dayAgo': '{n} დღის წინ',
  'feed.newMatch': 'ახალი დამთხვევა',
  'feed.priceDropMatch': 'ფასის კლება',

  'sources.title': 'მონაცემების წყაროები',
  'sources.korter': 'korter.ge — ცოცხალი, ოფიციალური JSON API',
  'sources.ssge': 'ss.ge — მიუწვდომელია (დაცვა ბოტებისგან)',
  'sources.myhome': 'myhome.ge — მიუწვდომელია (დაცვა ბოტებისგან)',
  'sources.note':
    'ვაჩვენებთ მხოლოდ იმას, რის გადამოწმებაც შეგვიძლია. სხვა წყაროებიც დაუკავშირდებიან იმავე რადარს, როგორც კი ხელმისაწვდომი გახდებიან.',

  'alerts.scanNow': 'სკანირება ახლავე',
  'alerts.scanTriggered': 'სკანირება დაიწყო — ახალი შესატყვისები რამდენიმე წამში გამოჩნდება',
  'alerts.invalidName': 'ჯერ დაარქვით თქვენს შეტყობინებას სახელი',
  'alerts.invalidRange': 'მინიმუმი არ უნდა აღემატებოდეს მაქსიმუმს',
  'alerts.browserBlocked': 'დაბლოკილია — ჩართეთ შეტყობინებები ამ საიტისთვის ბრაუზერის პარამეტრებში',

  'feed.listening': 'შესატყვისებზე მოსმენა',
  'feed.unreadCount': '{n} წაუკითხავი',
  'feed.previousPrice': 'იყო {price}',
  'feed.moreCount': '+{n} სხვა',

  'common.loading': 'იტვირთება',
  'common.error': 'რაღაც შეცდომა მოხდა',
  'common.retry': 'ხელახლა ცდა',
  'common.save': 'შენახვა',
  'common.cancel': 'გაუქმება',
  'common.close': 'დახურვა',
  'common.new': 'ახალი',
  'common.scanning': 'სკანირება',

  'footer.disclaimer': 'დამოუკიდებელი მონიტორინგის ხელსაწყო. არ ვართ დაკავშირებული korter.ge-სთან. განცხადებები © მათი მფლობელები.',
  'footer.data': 'მონაცემები: korter.ge-ს საჯარო API',

  'lang.switch': 'ენა',
};
