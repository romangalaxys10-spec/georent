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
    'Live monitoring across korter.ge, ss.ge and myhome.ge — fresh listings and price drops matched to your terms, the second they appear.',
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
  'listing.offerPage': 'Offer page',
  'listing.alsoOn': 'Also listed on another source',
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

  'footer.disclaimer': 'Independent monitoring tool. Not affiliated with korter.ge, ss.ge or myhome.ge. Listings © their owners.',
  'footer.data': 'Live data: korter.ge · ss.ge · myhome.ge',

  'lang.switch': 'Language',

  // --- Multi-source search ---
  'sources.live': 'Live',
  'sources.syncedSeconds': 'Synced {n}s ago',
  'sources.syncedMinutes': 'Synced {n}m ago',
  'sources.viewList': 'List',
  'sources.viewMap': 'Map',
  'sources.viewToggle': 'Feed view',
  'filters.sortScore': 'Best deal score',
  'filters.keyword': 'Keyword',
  'filters.keywordPlaceholder': 'e.g. Vake, renovation…',
  'filters.bedrooms': 'Bedrooms',
  'filters.floor': 'Floor',
  'filters.ppsm': 'Price per m² (USD)',
  'filters.features': 'Features',
  'filters.newBuilding': 'New building',
  'filters.hasBalcony': 'Balcony',
  'filters.sources': 'Sources',
  'filters.allSources': 'All sources',
  'common.loadMore': 'Load more',
  'map.legend': 'Deal score',
  'map.pins': 'on map',

  // --- Offer page ---
  'detail.liveSync': 'Live sync',
  'detail.syncNow': 'Sync now',
  'detail.syncing': 'Syncing…',
  'detail.offer': 'Offer',
  'detail.autoSync': 'Auto-syncs with the source site every 60s',
  'detail.description': 'Description',
  'detail.parameters': 'Parameters',
  'detail.seller': 'Seller',
  'detail.views': '{n} views',
  'detail.published': 'Published',
  'detail.listingId': 'Listing ID',
  'detail.viewOnSource': 'View on {site} ↗',
  'detail.copyLink': 'Copy link',
  'detail.copied': 'Copied',
  'detail.notFound': 'This offer is gone',
  'detail.notFoundBody': 'The source site no longer lists it — it was most likely sold or removed.',
  'detail.backToFeed': 'Back to the feed',
  'detail.priceHistory': 'Market price per m² (12 months)',
  'detail.marketAvg': 'Market avg',
  'detail.lowestSeen': 'Lowest seen',
  'detail.priceDrops': '{n} price drops',
  'detail.priceDropNow': 'Dropped {n}$',
  'detail.bedrooms': 'Bedrooms',
  'detail.bathrooms': 'Bathrooms',
  'detail.condition': 'Condition',
  'detail.buildYear': 'Built',
  'detail.balcony': 'Balcony',
  'detail.ceiling': 'Ceiling',
  'detail.kitchen': 'Kitchen',
  'detail.living': 'Living room',
  'detail.owner': 'Owner',
  'detail.agency': 'Agency',
  'detail.developer': 'Developer',
  'detail.crossListed': 'Also listed on',
  'detail.syncedJustNow': 'just now',
  'detail.yes': 'Yes',
  'detail.no': 'No',
};

export type English = typeof enSource;

export const dict: Dictionary = enSource;
