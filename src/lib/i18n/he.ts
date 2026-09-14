import type { Dictionary } from './types';

/**
 * Hebrew (עברית) dictionary — RTL locale.
 *
 * Keys are locked to the English source of truth via `Dictionary` — missing
 * or extra keys fail `tsc`. Placeholders like {n} / {total} are filled at
 * render time by simple string replacement; keep them verbatim.
 * Parity is re-checked at runtime by `scripts/check-i18n.ts`.
 */
export const dict: Dictionary = {
  'app.name': 'DealRadar Georgia',
  'app.tagline': 'תפסו את הצעות הדירות הטובות ביותר בגאורגיה לפני כולם',

  'nav.explore': 'חיפוש',
  'nav.alerts': 'התראות',
  'nav.feed': 'הודעות',
  'nav.sources': 'מקורות',

  'hero.title': 'היתרון שלכם בשוק הנדל״ן הגאורגי',
  'hero.subtitle':
    'מעקב בזמן אמת אחרי מודעות חדשות וירידות מחיר ב-korter.ge — מותאם לקריטריונים שלכם, ונשלח ברגע שהן מתפרסמות.',
  'hero.cta': 'צרו את ההתראה הראשונה שלכם',
  'hero.browse': 'עיינו במודעות העדכניות',

  'filters.title': 'תנאי חיפוש',
  'filters.budget': 'תקציב (USD)',
  'filters.from': 'מ־',
  'filters.to': 'עד',
  'filters.city': 'עיר',
  'filters.districts': 'שכונות',
  'filters.anyDistrict': 'כל השכונות',
  'filters.rooms': 'חדרים',
  'filters.anyRooms': 'הכול',
  'filters.area': 'שטח (מ״ר)',
  'filters.apply': 'החל',
  'filters.reset': 'איפוס',
  'filters.sort': 'מיון',
  'filters.sortNewest': 'חדשים קודם',
  'filters.sortCheapest': 'זולים קודם',
  'filters.sortPriceDrop': 'ציון העסקה הטוב ביותר',
  'filters.sortPpsm': 'מחיר למ״ר',

  'listing.new': 'חדש',
  'listing.priceDrop': 'ירידת מחיר',
  'listing.bumped': 'הוקפץ',
  'listing.perm2': '/מ״ר',
  'listing.view': 'צפייה ב-Korter',
  'listing.floor': 'קומה {n}/{total}',
  'listing.dealScore': 'ציון עסקה',
  'listing.scoreExcellent': 'מעולה',
  'listing.scoreGood': 'טוב',
  'listing.scoreFair': 'סביר',
  'listing.scorePricey': 'יקר',
  'listing.warmingUp': 'אוספים נתונים',
  'listing.studio': 'סטודיו',

  'alerts.create': 'יצירת התראה',
  'alerts.edit': 'עריכת התראה',
  'alerts.name': 'שם ההתראה',
  'alerts.namePlaceholder': 'לדוגמה: וואקה, 2 חדרים, עד 90 אלף דולר',
  'alerts.myAlerts': 'ההתראות שלי',
  'alerts.none': 'אין עדיין התראות — צרו אחת והתחילו לתפוס מציאות',
  'alerts.delete': 'מחיקה',
  'alerts.confirmDelete': 'למחוק את ההתראה הזו?',
  'alerts.active': 'פעילה',
  'alerts.paused': 'מושהית',
  'alerts.matches': 'התאמות',
  'alerts.pause': 'השהיה',
  'alerts.resume': 'המשך',
  'alerts.notifyBrowser': 'התראות דפדפן',
  'alerts.notifySound': 'צליל',
  'alerts.saved': 'ההתראה נשמרה',
  'alerts.deleted': 'ההתראה נמחקה',

  'feed.title': 'הודעות בזמן אמת',
  'feed.markAllRead': 'סמנו הכול כנקרא',
  'feed.empty': 'עדיין אין כלום. כשמודעה תואמת להתראה שלכם, היא תופיע כאן ראשונה.',
  'feed.justNow': 'עכשיו',
  'feed.minAgo': 'לפני {n} דק׳',
  'feed.hourAgo': 'לפני {n} שע׳',
  'feed.dayAgo': 'לפני {n} ימ׳',
  'feed.newMatch': 'התאמה חדשה',
  'feed.priceDropMatch': 'ירידת מחיר',

  'sources.title': 'מקורות מידע',
  'sources.korter': 'korter.ge — ממשק JSON רשמי וחי',
  'sources.ssge': 'ss.ge — לא זמין (הגנה מפני בוטים)',
  'sources.myhome': 'myhome.ge — לא זמין (הגנה מפני בוטים)',
  'sources.note':
    'אנחנו מציגים רק מה שאנחנו יכולים לאמת. מקורות נוספים יתחברו לאותו מכ״ם ברגע שיהיו נגישים.',

  'alerts.scanNow': 'סריקה עכשיו',
  'alerts.scanTriggered': 'הסריקה התחילה — התאמות חדשות יופיעו בעוד מספר שניות',
  'alerts.invalidName': 'קודם תנו שם להתראה',
  'alerts.invalidRange': 'המינימום לא יכול לעלות על המקסימום',
  'alerts.browserBlocked': 'חסום — אפשרו התראות לאתר זה בהגדרות הדפדפן',

  'feed.listening': 'מקשיבים להתאמות',
  'feed.unreadCount': '{n} שלא נקראו',
  'feed.previousPrice': 'היה {price}',
  'feed.moreCount': '+{n} נוספות',

  'common.loading': 'טוען',
  'common.error': 'משהו השתבש',
  'common.retry': 'נסו שוב',
  'common.save': 'שמור',
  'common.cancel': 'ביטול',
  'common.close': 'סגירה',
  'common.new': 'חדש',
  'common.scanning': 'סורק',

  'footer.disclaimer': 'כלי מעקב עצמאי. איננו קשורים ל-korter.ge. המודעות © בעליהן.',
  'footer.data': 'נתונים: ה-API הציבורי של korter.ge',

  'lang.switch': 'שפה',
};
