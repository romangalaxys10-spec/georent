import type { Dictionary } from './types';

/**
 * English — the source of truth for every key in the app (~82 flat keys).
 *
 * Typing note: the raw literal is declared WITHOUT an annotation and its
 * inferred shape is exported as `English`; types.ts derives
 * `TranslationKey = keyof English` and `Dictionary = Record<TranslationKey,
 * string>` from it. `dict` is then annotated with `Dictionary`, giving this
 * file the same compile-time guarantees as every other locale file.
 *
 * Placeholders like {n} / {total} are filled at render time by simple string
 * replacement — keep them verbatim in translations (see interpolate() in
 * types.ts).
 */
const enSource = {
  'app.name': 'DealRadar Georgia',
  'app.tagline': 'Catch the best apartment deals in Georgia before anyone else',

  'nav.explore': 'Explore',
  'nav.alerts': 'Alerts',
  'nav.feed': 'Notifications',
  'nav.sources': 'Sources',

  'hero.title': 'Your head start on the Georgian property market',
  'hero.subtitle':
    'Live monitoring of korter.ge new listings and price drops — matched to your terms, delivered the second they appear.',
  'hero.cta': 'Create your first alert',
  'hero.browse': 'Browse live listings',

  'filters.title': 'Search terms',
  'filters.budget': 'Budget (USD)',
  'filters.from': 'From',
  'filters.to': 'To',
  'filters.city': 'City',
  'filters.districts': 'Districts',
  'filters.anyDistrict': 'Any district',
  'filters.rooms': 'Rooms',
  'filters.anyRooms': 'Any',
  'filters.area': 'Area (m²)',
  'filters.apply': 'Apply',
  'filters.reset': 'Reset',
  'filters.sort': 'Sort',
  'filters.sortNewest': 'Newest first',
  'filters.sortCheapest': 'Cheapest first',
  'filters.sortPriceDrop': 'Best deal score',
  'filters.sortPpsm': 'Price per m²',

  'listing.new': 'NEW',
  'listing.priceDrop': 'Price drop',
  'listing.bumped': 'Bumped',
  'listing.perm2': '/m²',
  'listing.view': 'View on Korter',
  'listing.floor': 'Floor {n}/{total}',
  'listing.dealScore': 'Deal score',
  'listing.scoreExcellent': 'Excellent',
  'listing.scoreGood': 'Good',
  'listing.scoreFair': 'Fair',
  'listing.scorePricey': 'Pricey',
  'listing.warmingUp': 'Warming up',
  'listing.studio': 'Studio',

  'alerts.create': 'Create alert',
  'alerts.edit': 'Edit alert',
  'alerts.name': 'Alert name',
  'alerts.namePlaceholder': 'e.g. Vake 2-bed under $90k',
  'alerts.myAlerts': 'My alerts',
  'alerts.none': 'No alerts yet — create one to start catching deals',
  'alerts.delete': 'Delete',
  'alerts.confirmDelete': 'Delete this alert?',
  'alerts.active': 'Active',
  'alerts.paused': 'Paused',
  'alerts.matches': 'matches',
  'alerts.pause': 'Pause',
  'alerts.resume': 'Resume',
  'alerts.notifyBrowser': 'Browser notifications',
  'alerts.notifySound': 'Sound',
  'alerts.saved': 'Alert saved',
  'alerts.deleted': 'Alert deleted',

  'feed.title': 'Live notifications',
  'feed.markAllRead': 'Mark all read',
  'feed.empty': 'Nothing yet. When a listing matches your alert, it lands here first.',
  'feed.justNow': 'just now',
  'feed.minAgo': '{n}m ago',
  'feed.hourAgo': '{n}h ago',
  'feed.dayAgo': '{n}d ago',
  'feed.newMatch': 'New match',
  'feed.priceDropMatch': 'Price drop',

  'sources.title': 'Data sources',
  'sources.korter': 'korter.ge — live, official JSON API',
  'sources.ssge': 'ss.ge — unavailable (bot protection)',
  'sources.myhome': 'myhome.ge — unavailable (bot protection)',
  'sources.note':
    'We only show what we can verify. More sources plug into the same radar when accessible.',

  'alerts.scanNow': 'Scan now',
  'alerts.scanTriggered': 'Scan started — new matches will surface in a few seconds',
  'alerts.invalidName': 'Give your alert a name first',
  'alerts.invalidRange': 'Min must be ≤ max',
  'alerts.browserBlocked': 'Blocked — allow notifications for this site in the browser settings',

  'feed.listening': 'Listening for matches',
  'feed.unreadCount': '{n} unread',
  'feed.previousPrice': 'was {price}',
  'feed.moreCount': '+{n} more',

  'common.loading': 'Loading',
  'common.error': 'Something went wrong',
  'common.retry': 'Retry',
  'common.save': 'Save',
  'common.cancel': 'Cancel',
  'common.close': 'Close',
  'common.new': 'New',
  'common.scanning': 'Scanning',

  'footer.disclaimer': 'Independent monitoring tool. Not affiliated with korter.ge. Listings © their owners.',
  'footer.data': 'Data: korter.ge public API',

  'lang.switch': 'Language',
};

export type English = typeof enSource;

export const dict: Dictionary = enSource;
