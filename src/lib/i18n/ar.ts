import type { Dictionary } from './types';

/**
 * Arabic (العربية) dictionary — RTL locale, Modern Standard Arabic.
 *
 * Keys are locked to the English source of truth via `Dictionary` — missing
 * or extra keys fail `tsc`. Placeholders like {n} / {total} are filled at
 * render time by simple string replacement; keep them verbatim.
 * Parity is re-checked at runtime by `scripts/check-i18n.ts`.
 */
export const dict: Dictionary = {
  'app.name': 'DealRadar Georgia',
  'app.tagline': 'التقط أفضل عروض الشقق في جورجيا قبل أي شخص آخر',

  'nav.explore': 'استكشاف',
  'nav.alerts': 'التنبيهات',
  'nav.feed': 'الإشعارات',
  'nav.sources': 'المصادر',

  'hero.title': 'بدايتك المتقدمة في سوق العقارات الجورجي',
  'hero.subtitle':
    'مراقبة مباشرة للإعلانات الجديدة وانخفاضات الأسعار على korter.ge — مطابقة لشروطك، وتصلك في اللحظة التي تظهر فيها.',
  'hero.cta': 'أنشئ تنبيهك الأول',
  'hero.browse': 'تصفح الإعلانات الحالية',

  'filters.title': 'معايير البحث',
  'filters.budget': 'الميزانية (دولار)',
  'filters.from': 'من',
  'filters.to': 'إلى',
  'filters.city': 'المدينة',
  'filters.districts': 'الأحياء',
  'filters.anyDistrict': 'أي حي',
  'filters.rooms': 'الغرف',
  'filters.anyRooms': 'الكل',
  'filters.area': 'المساحة (م²)',
  'filters.apply': 'تطبيق',
  'filters.reset': 'إعادة تعيين',
  'filters.sort': 'الترتيب',
  'filters.sortNewest': 'الأحدث أولاً',
  'filters.sortCheapest': 'الأرخص أولاً',
  'filters.sortPriceDrop': 'أفضل تقييم للصفقة',
  'filters.sortPpsm': 'السعر لكل م²',

  'listing.new': 'جديد',
  'listing.priceDrop': 'انخفاض السعر',
  'listing.bumped': 'تم رفعه',
  'listing.perm2': '/م²',
  'listing.view': 'عرض على Korter',
  'listing.floor': 'الطابق {n}/{total}',
  'listing.dealScore': 'تقييم الصفقة',
  'listing.scoreExcellent': 'ممتاز',
  'listing.scoreGood': 'جيد',
  'listing.scoreFair': 'مقبول',
  'listing.scorePricey': 'غالي',
  'listing.warmingUp': 'جارٍ جمع البيانات',
  'listing.studio': 'ستوديو',

  'alerts.create': 'إنشاء تنبيه',
  'alerts.edit': 'تعديل التنبيه',
  'alerts.name': 'اسم التنبيه',
  'alerts.namePlaceholder': 'مثال: فاكه، غرفتان، أقل من 90 ألف دولار',
  'alerts.myAlerts': 'تنبيهاتي',
  'alerts.none': 'لا توجد تنبيهات بعد — أنشئ تنبيهاً لتبدأ في التقاط العروض',
  'alerts.delete': 'حذف',
  'alerts.confirmDelete': 'حذف هذا التنبيه؟',
  'alerts.active': 'نشط',
  'alerts.paused': 'متوقف مؤقتاً',
  'alerts.matches': 'تطابقات',
  'alerts.pause': 'إيقاف مؤقت',
  'alerts.resume': 'استئناف',
  'alerts.notifyBrowser': 'إشعارات المتصفح',
  'alerts.notifySound': 'الصوت',
  'alerts.saved': 'تم حفظ التنبيه',
  'alerts.deleted': 'تم حذف التنبيه',

  'feed.title': 'إشعارات مباشرة',
  'feed.markAllRead': 'تحديد الكل كمقروء',
  'feed.empty': 'لا شيء بعد. عندما يطابق إعلان تنبيهك، سيظهر هنا أولاً.',
  'feed.justNow': 'الآن',
  'feed.minAgo': 'قبل {n} د',
  'feed.hourAgo': 'قبل {n} س',
  'feed.dayAgo': 'قبل {n} يوم',
  'feed.newMatch': 'تطابق جديد',
  'feed.priceDropMatch': 'انخفاض السعر',

  'sources.title': 'مصادر البيانات',
  'sources.korter': 'korter.ge — واجهة JSON رسمية ومباشرة',
  'sources.ssge': 'ss.ge — غير متاح (حماية من الروبوتات)',
  'sources.myhome': 'myhome.ge — غير متاح (حماية من الروبوتات)',
  'sources.note':
    'لا نعرض إلا ما يمكننا التحقق منه. ستتصل مصادر أخرى بالرادار نفسه عند إتاحتها.',

  'alerts.scanNow': 'افحص الآن',
  'alerts.scanTriggered': 'بدأ الفحص — ستظهر المطابقات الجديدة خلال ثوانٍ',
  'alerts.invalidName': 'أدخل اسم التنبيه أولاً',
  'alerts.invalidRange': 'يجب ألا يتجاوز الحد الأدنى الحد الأقصى',
  'alerts.browserBlocked': 'محجوب — اسمح بالإشعارات لهذا الموقع من إعدادات المتصفح',

  'feed.listening': 'ننصت للمطابقات',
  'feed.unreadCount': '{n} غير مقروءة',
  'feed.previousPrice': 'كان {price}',
  'feed.moreCount': '+{n} أخرى',

  'common.loading': 'جارٍ التحميل',
  'common.error': 'حدث خطأ ما',
  'common.retry': 'إعادة المحاولة',
  'common.save': 'حفظ',
  'common.cancel': 'إلغاء',
  'common.close': 'إغلاق',
  'common.new': 'جديد',
  'common.scanning': 'جارٍ المسح',

  'footer.disclaimer': 'أداة مراقبة مستقلة. غير تابعة لـ korter.ge. الإعلانات © أصحابها.',
  'footer.data': 'البيانات: واجهة korter.ge العامة',

  'lang.switch': 'اللغة',
};
