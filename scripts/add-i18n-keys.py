#!/usr/bin/env python3
"""Append the local-ads + deal-type i18n keys to all 6 locale dictionaries.
Keys are appended before the closing `};` of each source object; parity is
guaranteed by using the same key set for every locale.
"""
import io

TRANSLATIONS = {
    # --- deal type (buy/rent) ---
    "search.dealTitle": {
        "en": "Deal type", "ka": "გარიგების ტიპი", "ru": "Тип сделки",
        "uk": "Тип угоди", "he": "סוג עסקה", "ar": "نوع الصفقة",
    },
    "search.dealBuy": {
        "en": "Buy", "ka": "კონსტრუქცია", "ru": "Купить", "uk": "Купити",
        "he": "קנייה", "ar": "شراء",
    },
    "search.dealRent": {
        "en": "Rent", "ka": "ქირავდება", "ru": "Аренда", "uk": "Оренда",
        "he": "השכרה", "ar": "إيجار",
    },
    "listing.perMonth": {
        "en": "/ month", "ka": "/ თვეში", "ru": "/ месяц", "uk": "/ місяць",
        "he": "/ לחודש", "ar": "/ شهرياً",
    },
    "listing.perMonthShort": {
        "en": "/mo", "ka": "/თვ", "ru": "/мес", "uk": "/міс",
        "he": "/חודש", "ar": "/شهر",
    },
    # --- local ads section ---
    "ads.title": {
        "en": "Local ads — sell or rent out your place",
        "ka": "ლოკალური განცხადებები — გაყიდეთ ან აქირავეთ თქვენი ბინა",
        "ru": "Локальные объявления — продайте или сдайте свою квартиру",
        "uk": "Локальні оголошення — продайте чи здайте в оренду своє житло",
        "he": "מודעות מקומיות — מכרו או השכירו את הדירה שלכם",
        "ar": "إعلانات محلية — بِع أو أجّر شقتك",
    },
    "ads.pitch": {
        "en": "Publish your apartment directly on DealRadar — no agency fees, no external site. Buyers and renters contact you, and your Telegram pings you the moment someone is interested.",
        "ka": "გამოაქვეყნეთ თქვენი ბინა პირდაპირ DealRadar-ზე — ზედნადების გარეშე, გარე საიტის გარეშე. მყიდველები და მქირავებლები დაგიკავშირდებიან, ხოლო თქვენი Telegram გაცნობებთ, როცა ვინმე დაინტერესდება.",
        "ru": "Разместите свою квартиру прямо на DealRadar — без комиссий и внешних сайтов. Покупатели и арендаторы свяжутся с вами, а Telegram уведомит, как только кто-то проявит интерес.",
        "uk": "Опублікуйте своє житло прямо на DealRadar — без комісій і зовнішніх сайтів. Покупці та орендарі зв'яжуться з вами, а Telegram повідомить, щойно хтось зацікавиться.",
        "he": "פרסמו את הדירה שלכם ישירות ב-DealRadar — בלי עמלות ובלי אתרים חיצוניים. קונים ושוכרים יצרו איתכם קשר, והטלגרם שלכם יצלצל ברגע שמישהו יתעניין.",
        "ar": "انشر شقتك مباشرة على DealRadar — دون عمولات أو مواقع خارجية. سيتواصل معك المشترون والمستأجرون، وسيصلك إشعار تيليجرام فور اهتمام أحدهم.",
    },
    "ads.pitchPoint1": {
        "en": "Free listing with photos, visible in the same feed as korter/ss/myhome",
        "ka": "უფასო განცხადება ფოტოებით — ერთსა და იმავე ლენტაში, როგორც korter/ss/myhome",
        "ru": "Бесплатное объявление с фото — в одной ленте с korter/ss/myhome",
        "uk": "Безкоштовне оголошення з фото — в одній стрічці з korter/ss/myhome",
        "he": "מודעה חינמית עם תמונות — באותה רשימה עם korter/ss/myhome",
        "ar": "إعلان مجاني بالصور — في نفس القائمة مع korter/ss/myhome",
    },
    "ads.pitchPoint2": {
        "en": "A login token that works everywhere — keep it, it is your API key",
        "ka": "ლოგინ ტოკენი, რომელიც ყველგან მუშაობს — შეინახეთ, ეს თქვენი API გასაღებია",
        "ru": "Токен входа, который работает везде — сохраните его, это ваш API-ключ",
        "uk": "Токен входу, що працює скрізь — збережіть його, це ваш API-ключ",
        "he": "אסימון התחברות שעובד בכל מקום — שמרו אותו, זה מפתח ה-API שלכם",
        "ar": "رمز دخول يعمل في كل مكان — احتفظ به، فهو مفتاح API الخاص بك",
    },
    "ads.pitchPoint3": {
        "en": "Telegram bot notifications for every interested contact",
        "ka": "Telegram შეტყობინებები ყოველი დაინტერესებული კონტაქტისთვის",
        "ru": "Уведомления в Telegram о каждом заинтересованном контакте",
        "uk": "Сповіщення в Telegram про кожний зацікавлений контакт",
        "he": "התראות טלגרם על כל פנייה מעניינת",
        "ar": "إشعارات تيليجرام عن كل جهة اتصال مهتمة",
    },
    "ads.createAccount": {
        "en": "Create account", "ka": "ანგარიშის შექმნა", "ru": "Создать аккаунт",
        "uk": "Створити акаунт", "he": "צרו חשבון", "ar": "إنشاء حساب",
    },
    "ads.publishAd": {
        "en": "Publish ad", "ka": "განცხადების გამოქვეყნება", "ru": "Разместить объявление",
        "uk": "Опублікувати", "he": "פרסמו מודעה", "ar": "نشر إعلان",
    },
    "ads.editAd": {
        "en": "Edit ad", "ka": "განცხადების რედაქტირება", "ru": "Изменить объявление",
        "uk": "Редагувати", "he": "ערכו מודעה", "ar": "تعديل الإعلان",
    },
    "ads.myListings": {
        "en": "My listings", "ka": "ჩემი განცხადებები", "ru": "Мои объявления",
        "uk": "Мої оголошення", "he": "המודעות שלי", "ar": "إعلاناتي",
    },
    "ads.noListings": {
        "en": "No listings yet — publish your first ad.",
        "ka": "ჯერ განცხადებები არ არის — გამოაქვეყნეთ პირველი.",
        "ru": "Объявлений пока нет — разместите первое.",
        "uk": "Оголошень поки немає — опублікуйте перше.",
        "he": "אין עדיין מודעות — פרסמו את הראשונה.",
        "ar": "لا إعلانات بعد — انشر أول إعلان.",
    },
    "ads.noPhoto": {
        "en": "no photo", "ka": "ფოტო არ არის", "ru": "нет фото", "uk": "немає фото",
        "he": "אין תמונה", "ar": "لا صورة",
    },
    "ads.paused": {
        "en": "paused", "ka": "დაპაუზებული", "ru": "на паузе", "uk": "на паузі",
        "he": "מושהה", "ar": "متوقف",
    },
    "ads.pause": {
        "en": "Pause listing", "ka": "დაპაუზება", "ru": "Пауза", "uk": "Пауза",
        "he": "השהה מודעה", "ar": "إيقاف مؤقت",
    },
    "ads.resume": {
        "en": "Resume listing", "ka": "განახლება", "ru": "Возобновить", "uk": "Відновити",
        "he": "הפעל מחדש", "ar": "استئناف",
    },
    "ads.delete": {
        "en": "Delete listing", "ka": "წაშლა", "ru": "Удалить", "uk": "Видалити",
        "he": "מחק מודעה", "ar": "حذف الإعلان",
    },
    "ads.confirmDelete": {
        "en": "Delete this listing? This cannot be undone.",
        "ka": "წავშალო ეს განცხადება? ქმედება შეუქცევადია.",
        "ru": "Удалить это объявление? Действие необратимо.",
        "uk": "Видалити це оголошення? Дію неможливо скасувати.",
        "he": "למחוק את המודעה? הפעולה אינה ניתנת לשחזור.",
        "ar": "حذف هذا الإعلان؟ لا يمكن التراجع.",
    },
    "ads.interests": {
        "en": "Interested contacts", "ka": "დაინტერესებულები", "ru": "Заинтересованные",
        "uk": "Зацікавлені", "he": "פניות", "ar": "المهتمون",
    },
    "ads.noInterests": {
        "en": "No one has contacted you yet.",
        "ka": "ჯერ არავინ დაგიკავშირებიათ.",
        "ru": "Пока никто не написал.",
        "uk": "Поки ніхто не написав.",
        "he": "עדיין אף אחד לא יצר קשר.",
        "ar": "لم يتواصل معك أحد بعد.",
    },
    "ads.markRead": {
        "en": "Mark all read", "ka": "წაკითხულად მონიშვნა", "ru": "Прочитано",
        "uk": "Позначити прочитаним", "he": "סמן כנקרא", "ar": "تحديد كمقروء",
    },
    "ads.telegram": {
        "en": "Telegram notifications", "ka": "Telegram შეტყობინებები",
        "ru": "Уведомления Telegram", "uk": "Сповіщення Telegram",
        "he": "התראות טלגרם", "ar": "إشعارات تيليجرام",
    },
    "ads.tgPaired": {
        "en": "Telegram paired", "ka": "Telegram დაკავშირებულია", "ru": "Telegram привязан",
        "uk": "Telegram підключено", "he": "טלגרם מחובר", "ar": "تم ربط تيليجرام",
    },
    "ads.tgUnpair": {
        "en": "Unpair", "ka": "გათიშვა", "ru": "Отвязать", "uk": "Відключити",
        "he": "נתק", "ar": "إلغاء الربط",
    },
    "ads.tgPairCta": {
        "en": "Pair Telegram", "ka": "Telegram-ის დაკავშირება", "ru": "Привязать Telegram",
        "uk": "Підключити Telegram", "he": "חברו טלגרם", "ar": "ربط تيليجرام",
    },
    "ads.tgStep1": {
        "en": "Open the bot",
        "ka": "გახსენით ბოტი", "ru": "Откройте бота", "uk": "Відкрийте бота",
        "he": "פתחו את הבוט", "ar": "افتح البوت",
    },
    "ads.tgTheBot": {
        "en": "the DealRadar bot", "ka": "DealRadar ბოტი", "ru": "бот DealRadar",
        "uk": "бот DealRadar", "he": "בוט DealRadar", "ar": "بوت DealRadar",
    },
    "ads.tgStep2": {
        "en": "and send this command:",
        "ka": "და გაგზავნეთ ეს ბრძანება:", "ru": "и отправьте команду:",
        "uk": "і надішліть команду:", "he": "ושלחו את הפקודה:", "ar": "وأرسل هذا الأمر:",
    },
    "ads.tgCodeExpires": {
        "en": "The code expires in 15 minutes.",
        "ka": "კოდი იმუშავებს 15 წუთი.",
        "ru": "Код действует 15 минут.",
        "uk": "Код діє 15 хвилин.",
        "he": "הקוד תקף ל-15 דקות.",
        "ar": "ينتهي الرمز خلال 15 دقيقة.",
    },
    "ads.tgNotConfigured": {
        "en": "Telegram notifications are not configured on this deployment yet (TELEGRAM_BOT_TOKEN missing) — meanwhile every interested contact still shows up here in your dashboard.",
        "ka": "Telegram შეტყობინებები ჯერ არ არის კონფიგურირებული (TELEGRAM_BOT_TOKEN აკლია) — მაგრამ ყველა დაინტერესებული მაინც გამოჩნდება აქ, თქვენს პანელში.",
        "ru": "Уведомления Telegram пока не настроены на этом сервере (нет TELEGRAM_BOT_TOKEN) — но все заинтересованные всё равно появятся здесь, в вашей панели.",
        "uk": "Сповіщення Telegram ще не налаштовані на цьому сервері (немає TELEGRAM_BOT_TOKEN) — але всі зацікавлені все одно з'являться тут, у вашій панелі.",
        "he": "התראות טלגרם עדיין לא מוגדרות בשרת זה (חסר TELEGRAM_BOT_TOKEN) — אבל כל פנייה עדיין תופיע כאן, בלוח שלכם.",
        "ar": "إشعارات تيليجرام غير مهيأة على هذا الخادم بعد (TELEGRAM_BOT_TOKEN مفقود) — لكن كل مهتم سيظهر هنا في لوحتك.",
    },
    "ads.showToken": {
        "en": "Show token", "ka": "ტოკენის ჩვენება", "ru": "Показать токен",
        "uk": "Показати токен", "he": "הצג אסימון", "ar": "إظهار الرمز",
    },
    "ads.hideToken": {
        "en": "Hide token", "ka": "ტოკენის დამალვა", "ru": "Скрыть токен",
        "uk": "Сховати токен", "he": "הסתר אסימון", "ar": "إخفاء الرمز",
    },
    "ads.tokenNote": {
        "en": "Use this token with Authorization: Bearer <token> to manage your ads from scripts or the mobile app.",
        "ka": "გამოიყენეთ ეს ტოკენი Authorization: Bearer <token> სახით — თქვენი განცხადებების სკრიპტებიდან ან მობილური აპლიკაციიდან მართვისთვის.",
        "ru": "Используйте этот токен как Authorization: Bearer <token>, чтобы управлять объявлениями из скриптов или мобильного приложения.",
        "uk": "Використовуйте цей токен як Authorization: Bearer <token>, щоб керувати оголошеннями зі скриптів чи мобільного застосунку.",
        "he": "השתמשו באסימון זה כ-Authorization: Bearer <token> לניהול המודעות מסקריפטים או מהאפליקציה.",
        "ar": "استخدم هذا الرمز بصيغة Authorization: Bearer <token> لإدارة إعلاناتك من السكربتات أو التطبيق.",
    },
    # --- ad form ---
    "ads.title": None if False else None,  # placeholder no-op
    "ads.title_": {
        "en": "Listing title", "ka": "განცხადების სათაური", "ru": "Заголовок объявления",
        "uk": "Заголовок оголошення", "he": "כותרת המודעה", "ar": "عنوان الإعلان",
    },
    "ads.titlePlaceholder": {
        "en": "e.g. Sunny 2-room apartment in Vake",
        "ka": "მაგ. მზიანი 2-ოთახიანი ბინა ვაკეში",
        "ru": "напр. Светлая 2-комнатная квартира в Ваке",
        "uk": "напр. Світла 2-кімнатна квартира у Ваке",
        "he": "למשל דירה שמשית בת 2 חדרים בואקה",
        "ar": "مثال شقة مشمسة بغرفتين في فاكه",
    },
    "ads.price": {
        "en": "Price", "ka": "ფასი", "ru": "Цена", "uk": "Ціна", "he": "מחיר", "ar": "السعر",
    },
    "ads.perMonthUsd": {
        "en": "USD / month", "ka": "USD / თვე", "ru": "USD / месяц", "uk": "USD / місяць",
        "he": "דולר / לחודש", "ar": "دولار / شهر",
    },
    "ads.area": {
        "en": "Area (m²)", "ka": "ფართი (მ²)", "ru": "Площадь (м²)", "uk": "Площа (м²)",
        "he": "שטח (מ״ר)", "ar": "المساحة (م²)",
    },
    "ads.floorCount": {
        "en": "Total floors", "ka": "სართულები სულ", "ru": "Этажей всего", "uk": "Поверхів усього",
        "he": "סך הקומות", "ar": "إجمالي الطوابق",
    },
    "ads.furnished": {
        "en": "Furniture", "ka": "ავეჯი", "ru": "Мебель", "uk": "Меблі", "he": "ריהוט", "ar": "الأثاث",
    },
    "ads.district": {
        "en": "District", "ka": "უბანი", "ru": "Район", "uk": "Район", "he": "שכונה", "ar": "الحي",
    },
    "ads.address": {
        "en": "Address (optional)", "ka": "მისამართი (არასავალდებულო)", "ru": "Адрес (необязательно)",
        "uk": "Адреса (необов'язково)", "he": "כתובת (אופציונלי)", "ar": "العنوان (اختياري)",
    },
    "ads.addressPlaceholder": {
        "en": "Street and house number", "ka": "ქუჩა და სახლის ნომერი", "ru": "Улица и номер дома",
        "uk": "Вулиця і номер будинку", "he": "רחוב ומספר בית", "ar": "الشارع ورقم المنزل",
    },
    "ads.description": {
        "en": "Description", "ka": "აღწერა", "ru": "Описание", "uk": "Опис",
        "he": "תיאור", "ar": "الوصف",
    },
    "ads.descriptionPlaceholder": {
        "en": "Tell buyers what makes this place special…",
        "ka": "მიმართეთ მყიდველებს — რა განსაკუთრებულია ამ ბინაში…",
        "ru": "Расскажите покупателям, чем особенная эта квартира…",
        "uk": "Розкажіть покупцям, чим особлива ця квартира…",
        "he": "ספרו לקונים מה מיוחד בדירה…",
        "ar": "أخبر المشترين ما الذي يميز هذه الشقة…",
    },
    "ads.contactName": {
        "en": "Contact name", "ka": "საკონტაქტო სახელი", "ru": "Имя контакта",
        "uk": "Ім'я контакту", "he": "שם ליצירת קשר", "ar": "اسم جهة الاتصال",
    },
    "ads.contactPhone": {
        "en": "Contact phone", "ka": "საკონტაქტო ტელეფონი", "ru": "Контактный телефон",
        "uk": "Контактний телефон", "he": "טלפון", "ar": "هاتف الاتصال",
    },
    "ads.photos": {
        "en": "Photos (up to 8)", "ka": "ფოტოები (8-მდე)", "ru": "Фото (до 8)",
        "uk": "Фото (до 8)", "he": "תמונות (עד 8)", "ar": "الصور (حتى 8)",
    },
    "ads.photoTooLarge": {
        "en": "Photo is too large even after compression — try a smaller image.",
        "ka": "ფოტო ძალიან დიდია შეკუმშვის შემდეგაც — სცადეთ პატარა სურათი.",
        "ru": "Фото слишком большое даже после сжатия — попробуйте меньшее.",
        "uk": "Фото завелике навіть після стиснення — спробуйте менше.",
        "he": "התמונה גדולה מדי גם אחרי דחיסה — נסו תמונה קטנה.",
        "ar": "الصورة كبيرة جداً حتى بعد الضغط — جرّب صورة أصغر.",
    },
    "ads.publishCta": {
        "en": "Publish", "ka": "გამოქვეყნება", "ru": "Опубликовать", "uk": "Опублікувати",
        "he": "פרסום", "ar": "نشر",
    },
    "ads.saveChanges": {
        "en": "Save changes", "ka": "ცვლილებების შენახვა", "ru": "Сохранить",
        "uk": "Зберегти", "he": "שמור שינויים", "ar": "حفظ التغييرات",
    },
    # --- auth dialog ---
    "auth.title": {
        "en": "Local ads account", "ka": "ლოკალური განცხადებების ანგარიში",
        "ru": "Аккаунт локальных объявлений", "uk": "Акаунт локальних оголошень",
        "he": "חשבון מודעות מקומיות", "ar": "حساب الإعلانات المحلية",
    },
    "auth.signIn": {
        "en": "Sign in", "ka": "შესვლა", "ru": "Вход", "uk": "Вхід", "he": "התחברות", "ar": "تسجيل الدخول",
    },
    "auth.signUp": {
        "en": "Sign up", "ka": "რეგისტრაცია", "ru": "Регистрация", "uk": "Реєстрація",
        "he": "הרשמה", "ar": "إنشاء حساب",
    },
    "auth.signInCta": {
        "en": "Sign in", "ka": "შესვლა", "ru": "Войти", "uk": "Увійти", "he": "התחבר", "ar": "دخول",
    },
    "auth.createAccount": {
        "en": "Create account", "ka": "ანგარიშის შექმნა", "ru": "Создать аккаунт",
        "uk": "Створити акаунт", "he": "צרו חשבון", "ar": "إنشاء حساب",
    },
    "auth.signOut": {
        "en": "Sign out", "ka": "გამოსვლა", "ru": "Выйти", "uk": "Вийти", "he": "התנתק", "ar": "خروج",
    },
    "auth.name": {
        "en": "Your name", "ka": "თქვენი სახელი", "ru": "Ваше имя", "uk": "Ваше ім'я",
        "he": "השם שלכם", "ar": "اسمك",
    },
    "auth.email": {
        "en": "Email", "ka": "ელ. ფოსტა", "ru": "Email", "uk": "Email", "he": "אימייל", "ar": "البريد الإلكتروني",
    },
    "auth.password": {
        "en": "Password", "ka": "პაროლი", "ru": "Пароль", "uk": "Пароль", "he": "סיסמה", "ar": "كلمة المرور",
    },
    "auth.passwordHint": {
        "en": "At least 8 characters.",
        "ka": "მინიმუმ 8 სიმბოლო.", "ru": "Минимум 8 символов.",
        "uk": "Щонайменше 8 символів.", "he": "לפחות 8 תווים.", "ar": "8 أحرف على الأقل.",
    },
    "auth.accountReady": {
        "en": "Account ready", "ka": "ანგარიში მზადაა", "ru": "Аккаунт готов",
        "uk": "Акаунт готовий", "he": "החשבון מוכן", "ar": "الحساب جاهز",
    },
    "auth.tokenExplanation": {
        "en": "This is your personal login token. It is shown only once — store it somewhere safe. You will need it to sign in on other devices or to manage your ads via API.",
        "ka": "ეს არის თქვენი პირადი ლოგინ ტოკენი. ის მხოლოდ ერთხელ ჩანს — შეინახეთ უსაფრთხო ადგილას. დაგჭირდებათ სხვა მოწყობილობაზე შესასვლელად ან განცხადებების API-ით სამართავად.",
        "ru": "Это ваш персональный токен входа. Он показывается только один раз — сохраните его в надёжном месте. Он понадобится для входа на других устройствах или управления объявлениями через API.",
        "uk": "Це ваш персональний токен входу. Він показується лише один раз — збережіть його в надійному місці. Він знадобиться для входу на інших пристроях чи керування оголошеннями через API.",
        "he": "זהו אסימון ההתחברות האישי שלכם. הוא מוצג פעם אחת בלבד — שמרו אותו במקום בטוח. תזדקקו לו כדי להיכנס ממכשירים אחרים או לנהל מודעות דרך ה-API.",
        "ar": "هذا رمز الدخول الشخصي الخاص بك. يظهر مرة واحدة فقط — احفظه في مكان آمن. ستحتاجه للدخول من أجهزة أخرى أو لإدارة إعلاناتك عبر API.",
    },
    "auth.yourToken": {
        "en": "Your token", "ka": "თქვენი ტოკენი", "ru": "Ваш токен", "uk": "Ваш токен",
        "he": "האסימון שלכם", "ar": "الرمز الخاص بك",
    },
    "auth.copyToken": {
        "en": "Copy token", "ka": "ტოკენის კოპირება", "ru": "Скопировать токен",
        "uk": "Копіювати токен", "he": "העתק אסימון", "ar": "نسخ الرمز",
    },
    "auth.continue": {
        "en": "Continue", "ka": "გაგრძელება", "ru": "Продолжить", "uk": "Продовжити",
        "he": "המשך", "ar": "متابعة",
    },
    "auth.termsNote": {
        "en": "By creating an account you agree that your listing's contact details are visible to visitors.",
        "ka": "ანგარიშის შექმნით ეთანხმებით, რომ თქვენი განცხადების საკონტაქტო მონაცემები ხილული იქნება ვიზიტორებისთვის.",
        "ru": "Создавая аккаунт, вы соглашаетесь, что контактные данные объявления видны посетителям.",
        "uk": "Створюючи акаунт, ви погоджуєтеся, що контактні дані оголошення видимі відвідувачам.",
        "he": "ביצירת חשבון אתם מסכימים שפרטי הקשר של המודעה יהיו גלויים למבקרים.",
        "ar": "بإنشاء حساب، أنت توافق على أن بيانات الاتصال بإعلانك مرئية للزوار.",
    },
    # --- detail page: local ads ---
    "detail.ownerListing": {
        "en": "Owner listing", "ka": "მფლობელის განცხადება", "ru": "Объявление владельца",
        "uk": "Оголошення власника", "he": "מודעת בעלים", "ar": "إعلان المالك",
    },
    "detail.ownerListingSub": {
        "en": "Published directly by the owner on DealRadar — no middlemen.",
        "ka": "გამოქვეყნებულია პირდაპირ მფლობელის მიერ DealRadar-ზე — შუამავლების გარეშე.",
        "ru": "Опубликовано владельцем напрямую на DealRadar — без посредников.",
        "uk": "Опубліковано власником напряму на DealRadar — без посередників.",
        "he": "פורסם ישירות על ידי הבעלים ב-DealRadar — בלי מתווכים.",
        "ar": "منشور مباشرة من المالك على DealRadar — دون وسطاء.",
    },
    "detail.imInterested": {
        "en": "I'm interested", "ka": "დამაინტერესებს", "ru": "Заинтересован",
        "uk": "Цікавить", "he": "מתעניין", "ar": "أنا مهتم",
    },
    "detail.yourName": {
        "en": "Your name", "ka": "თქვენი სახელი", "ru": "Ваше имя", "uk": "Ваше ім'я",
        "he": "השם שלך", "ar": "اسمك",
    },
    "detail.yourNamePlaceholder": {
        "en": "How should the owner call you back?",
        "ka": "როგორ დაგირეკოს მფლობელმა?",
        "ru": "Как владельцу вам перезвонить?",
        "uk": "Як власнику вам передзвонити?",
        "he": "איך הבעלים יחזרו אליכם?",
        "ar": "كيف يعيد المالك الاتصال بك؟",
    },
    "detail.yourPhone": {
        "en": "Your phone", "ka": "თქვენი ტელეფონი", "ru": "Ваш телефон", "uk": "Ваш телефон",
        "he": "הטלפון שלך", "ar": "هاتفك",
    },
    "detail.yourMessage": {
        "en": "Message (optional)", "ka": "შეტყობინება (არასავალდებულო)", "ru": "Сообщение (необязательно)",
        "uk": "Повідомлення (необов'язково)", "he": "הודעה (אופציונלי)", "ar": "رسالة (اختياري)",
    },
    "detail.yourMessagePlaceholder": {
        "en": "Hi, is this still available? When can I view it?",
        "ka": "გამარჯობა, ჯერ კიდევ თავისუფალია? როდის შემიძლია ნახვა?",
        "ru": "Здравствуйте, ещё актуально? Когда можно посмотреть?",
        "uk": "Вітаю, ще актуально? Коли можна подивитися?",
        "he": "היי, זה עדיין פנוי? מתי אפשר לראות?",
        "ar": "مرحباً، هل ما زالت متاحة؟ متى يمكنني المشاهدة؟",
    },
    "detail.sendInterest": {
        "en": "Send contact request", "ka": "კონტაქტის გაგზავნა", "ru": "Отправить заявку",
        "uk": "Надіслати запит", "he": "שלחו פנייה", "ar": "إرسال الطلب",
    },
    "detail.sending": {
        "en": "Sending…", "ka": "იგზავნება…", "ru": "Отправка…", "uk": "Надсилання…",
        "he": "שולח…", "ar": "جارٍ الإرسال…",
    },
    "detail.interestSent": {
        "en": "Request sent!",
        "ka": "მოთხოვნა გაგზავნილია!",
        "ru": "Заявка отправлена!",
        "uk": "Запит надіслано!",
        "he": "הפנייה נשלחה!",
        "ar": "تم إرسال الطلب!",
    },
    "detail.interestSentBody": {
        "en": "The owner got your contact and will call you back. If the owner paired Telegram, they were notified instantly.",
        "ka": "მფლობელმა მიიღო თქვენი კონტაქტი და დაგირეკავს. თუ მფლობელს Telegram აქვს დაკავშირებული, ის მაშინვე შეატყობინა.",
        "ru": "Владелец получил ваш контакт и перезвонит. Если у владельца привязан Telegram, он уведомлён мгновенно.",
        "uk": "Власник отримав ваш контакт і передзвонить. Якщо у власника підключений Telegram, його повідомлено миттєво.",
        "he": "הבעלים קיבלו את פרטי הקשר ויחזרו אליכם. אם לבעלים מחובר טלגרם, הם קיבלו התראה מיד.",
        "ar": "تلقى المالك بياناتك وسيعيد الاتصال. إذا كان تيليجرام مربوطاً، تم إشعاره فوراً.",
    },
    "detail.interestPrivacy": {
        "en": "Your phone goes only to the owner of this listing.",
        "ka": "თქვენი ტელეფონი მხოლოდ ამ განცხადების მფლობელს მივა.",
        "ru": "Ваш телефон получит только владелец этого объявления.",
        "uk": "Ваш телефон отримає лише власник цього оголошення.",
        "he": "מספר הטלפון יימסר רק לבעלים של המודעה.",
        "ar": "هاتفك سيصل فقط لصاحب هذا الإعلان.",
    },
    # --- condition / furnished tokens ---
    "condition.new": {
        "en": "New building", "ka": "ახალი აშენებული", "ru": "Новостройка", "uk": "Новобудова",
        "he": "בניין חדש", "ar": "مبنى جديد",
    },
    "condition.renovated": {
        "en": "Renovated", "ka": "რემონტირებული", "ru": "С ремонтом", "uk": "З ремонтом",
        "he": "משופץ", "ar": "مجدد",
    },
    "condition.old": {
        "en": "Old renovated / needs repair", "ka": "ძველი რემონტი / სარემონტო", "ru": "Старый / требует ремонта",
        "uk": "Старе / потребує ремонту", "he": "ישן / דורש שיפוץ", "ar": "قديم / يحتاج ترميم",
    },
    "condition.under": {
        "en": "Under construction", "ka": "მშენებლობაში", "ru": "Строится", "uk": "Будується",
        "he": "בבנייה", "ar": "قيد البناء",
    },
    "furnished.yes": {
        "en": "Furnished", "ka": "ავეჯით", "ru": "С мебелью", "uk": "З меблями",
        "he": "מרוהט", "ar": "مفروش",
    },
    "furnished.no": {
        "en": "Unfurnished", "ka": "ავეჯის გარეშე", "ru": "Без мебели", "uk": "Без меблів",
        "he": "לא מרוהט", "ar": "غير مفروش",
    },
    "furnished.partial": {
        "en": "Partially furnished", "ka": "ნაწილობრივ ავეჯით", "ru": "Частично с мебелью",
        "uk": "Частково з меблями", "he": "מרוהט חלקית", "ar": "مفروش جزئياً",
    },
    "common.close": {
        "en": "Close", "ka": "დახურვა", "ru": "Закрыть", "uk": "Закрити",
        "he": "סגור", "ar": "إغلاق",
    },
    "common.remove": {
        "en": "Remove", "ka": "მოცილება", "ru": "Убрать", "uk": "Прибрати",
        "he": "הסר", "ar": "إزالة",
    },
}

# ads.title collides with the section title; form uses ads.title_ mapped to ads.title key? No —
# remove the placeholder hack: drop the None entry and use dedicated key for form label.
TRANSLATIONS.pop("ads.title", None)
# The form's "Listing title" label gets its own key:
TRANSLATIONS["ads.formTitle"] = TRANSLATIONS.pop("ads.title_")

LOCALES = {
    "en": "en", "ka": "ka", "ru": "ru", "uk": "uk", "he": "he", "ar": "ar",
}
VARS = {"en": "enSource", "ka": "kaSource", "ru": "ruSource", "uk": "ukSource", "he": "heSource", "ar": "arSource"}

def q(s: str) -> str:
    # json-ish escaping good enough for these strings (all ASCII quotes avoided; we use ' inside)
    return "'" + s.replace("\\", "\\\\").replace("'", "\\'") + "'"

for fname, loc in LOCALES.items():
    path = f"src/lib/i18n/{fname}.ts"
    src = io.open(path, encoding="utf-8").read()
    var = VARS[fname]
    close = f"\n}};\n\nexport type English = typeof {var};" if fname == "en" else None
    # find the last '};' that closes the dict object: pattern "\n};"
    idx = src.rfind("\n};")
    assert idx != -1, path
    block = []
    for key in sorted(TRANSLATIONS):
        val = TRANSLATIONS[key][loc]
        block.append(f"  {q(key)}: {q(val)},")
    insert = "\n" + "\n".join(block) + "\n"
    src = src[:idx] + insert + src[idx:]
    io.open(path, "w", encoding="utf-8").write(src)
    print(f"{fname}: +{len(TRANSLATIONS)} keys")
print("done")
