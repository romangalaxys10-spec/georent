import type { Dictionary } from './types';

/**
 * Ukrainian (Українська) dictionary.
 *
 * Keys are locked to the English source of truth via `Dictionary` — missing
 * or extra keys fail `tsc`. Placeholders like {n} / {total} are filled at
 * render time by simple string replacement; keep them verbatim.
 * Parity is re-checked at runtime by `scripts/check-i18n.ts`.
 */
export const dict: Dictionary = {
  'app.name': 'DealRadar Georgia',
  'app.tagline': 'Ловіть найкращі пропозиції квартир у Грузії раніше за всіх',

  'nav.explore': 'Пошук',
  'nav.alerts': 'Оповіщення',
  'nav.feed': 'Повідомлення',
  'nav.sources': 'Джерела',

  'hero.title': 'Будьте на крок попереду на ринку нерухомості Грузії',
  'hero.subtitle':
    'Відстежуємо нові оголошення та зниження цін на korter.ge в реальному часі — за вашими критеріями й у ту ж мить, коли вони з’являються.',
  'hero.cta': 'Створіть перше оповіщення',
  'hero.browse': 'Переглянути актуальні оголошення',

  'filters.title': 'Параметри пошуку',
  'filters.budget': 'Бюджет (USD)',
  'filters.from': 'Від',
  'filters.to': 'До',
  'filters.city': 'Місто',
  'filters.districts': 'Райони',
  'filters.anyDistrict': 'Будь-який район',
  'filters.rooms': 'Кімнати',
  'filters.anyRooms': 'Будь-яка',
  'filters.area': 'Площа (м²)',
  'filters.apply': 'Застосувати',
  'filters.reset': 'Скинути',
  'filters.sort': 'Сортування',
  'filters.sortNewest': 'Спочатку нові',
  'filters.sortCheapest': 'Спочатку дешевші',
  'filters.sortPriceDrop': 'Найкращий рейтинг вигідності',
  'filters.sortPpsm': 'Ціна за м²',

  'listing.new': 'НОВЕ',
  'listing.priceDrop': 'Зниження ціни',
  'listing.bumped': 'Піднято',
  'listing.perm2': '/м²',
  'listing.view': 'Переглянути на Korter',
  'listing.floor': 'Поверх {n}/{total}',
  'listing.dealScore': 'Рейтинг вигідності',
  'listing.scoreExcellent': 'Відмінно',
  'listing.scoreGood': 'Добре',
  'listing.scoreFair': 'Середньо',
  'listing.scorePricey': 'Дорого',
  'listing.warmingUp': 'Збираємо дані',
  'listing.studio': 'Студія',

  'alerts.create': 'Створити оповіщення',
  'alerts.edit': 'Редагувати оповіщення',
  'alerts.name': 'Назва оповіщення',
  'alerts.namePlaceholder': 'напр. Ваке, 2-кімн., до $90 тис.',
  'alerts.myAlerts': 'Мої оповіщення',
  'alerts.none': 'Ще немає оповіщень — створіть одне й почніть ловити вигідні пропозиції',
  'alerts.delete': 'Видалити',
  'alerts.confirmDelete': 'Видалити це оповіщення?',
  'alerts.active': 'Активне',
  'alerts.paused': 'На паузі',
  'alerts.matches': 'збігів',
  'alerts.pause': 'Пауза',
  'alerts.resume': 'Відновити',
  'alerts.notifyBrowser': 'Сповіщення браузера',
  'alerts.notifySound': 'Звук',
  'alerts.saved': 'Оповіщення збережено',
  'alerts.deleted': 'Оповіщення видалено',

  'feed.title': 'Повідомлення в реальному часі',
  'feed.markAllRead': 'Позначити все прочитаним',
  'feed.empty': 'Поки що порожньо. Щойно оголошення збігається з вашим оповіщенням, воно з’явиться тут першим.',
  'feed.justNow': 'щойно',
  'feed.minAgo': '{n} хв. тому',
  'feed.hourAgo': '{n} год. тому',
  'feed.dayAgo': '{n} дн. тому',
  'feed.newMatch': 'Новий збіг',
  'feed.priceDropMatch': 'Зниження ціни',

  'sources.title': 'Джерела даних',
  'sources.korter': 'korter.ge — живий офіційний JSON API',
  'sources.ssge': 'ss.ge — недоступний (захист від ботів)',
  'sources.myhome': 'myhome.ge — недоступний (захист від ботів)',
  'sources.note':
    'Показуємо лише те, що можемо перевірити. Інші джерела підключаться до того самого радара, щойно стануть доступними.',

  'alerts.scanNow': 'Сканувати зараз',
  'alerts.scanTriggered': 'Сканування запущено — нові збіги з’являться за кілька секунд',
  'alerts.invalidName': 'Спочатку задайте ім’я оповіщення',
  'alerts.invalidRange': 'Мінімум не має перевищувати максимум',
  'alerts.browserBlocked': 'Заблоковано — дозвольте сповіщення для цього сайту в налаштуваннях браузера',

  'feed.listening': 'Слухаємо збіги',
  'feed.unreadCount': '{n} непрочитаних',
  'feed.previousPrice': 'було {price}',
  'feed.moreCount': '+{n} ще',

  'common.loading': 'Завантаження',
  'common.error': 'Щось пішло не так',
  'common.retry': 'Повторити',
  'common.save': 'Зберегти',
  'common.cancel': 'Скасувати',
  'common.close': 'Закрити',
  'common.new': 'Новий',
  'common.scanning': 'Скануємо',

  'footer.disclaimer': 'Незалежний інструмент моніторингу. Не пов’язаний із korter.ge. Оголошення © їхніх власників.',
  'footer.data': 'Дані: публічний API korter.ge',

  'lang.switch': 'Мова',
};
