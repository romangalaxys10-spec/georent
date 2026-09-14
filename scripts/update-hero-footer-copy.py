#!/usr/bin/env python3
"""Update hero.subtitle + footer.disclaimer across locales for 3-source reality."""
import pathlib

SUBS = {
    "en": None,  # already done
    "ka": {
        "old": """  'hero.subtitle':
    'Live monitoring of korter.ge new listings and price drops — matched to your terms, delivered the second they appear.',""",
        "sub_new": """  'hero.subtitle':
    'Live monitoring of korter.ge, ss.ge and myhome.ge — ყოველი ახალი განცხადება და ფასის ცვლილება თქვენი პირობებით, პირველებმა.',""",
        "disc_old": "'დამოუკიდებელი მონიტორინგის ხელსაწყო. არ ვართ დაკავშირებული korter.ge-სთან. განცხადებები © მათი მფლობელები.'",
        "disc_new": "'დამოუკიდებელი მონიტორინგის ხელსაწყო. არ ვართ დაკავშირებული korter.ge-, ss.ge- ან myhome.ge-სთან. განცხადებები © მათი მფლობელები.'",
    },
}
# ka hero.subtitle needs checking; simpler: replace footer.disclaimer only for
# non-en locales, and rewrite hero.subtitle via regex on the korter.ge mention.
LOCALES = {
    "ka": {
        "disc_old": "korter.ge-სთან. განცხადებები",
        "disc_new": "korter.ge-, ss.ge- ან myhome.ge-სთან. განცხადებები",
        "hero_old_snippet": "'Live monitoring of korter.ge new listings and price drops — matched to your terms, delivered the second they appear.'",
        "hero_new": "'კომპლექსური მონიტორინგი korter.ge, ss.ge და myhome.ge-ზე — ახალი განცხადებები და ფასის ვარდნა თქვენი პირობებით, პირველებმა.'",
    },
    "ru": {
        "disc_old": "Не аффилирован с korter.ge.",
        "disc_new": "Не аффилирован с korter.ge, ss.ge или myhome.ge.",
        "hero_old_snippet": "'Live monitoring of korter.ge new listings and price drops — matched to your terms, delivered the second they appear.'",
        "hero_new": "'Мониторим korter.ge, ss.ge и myhome.ge в реальном времени — новые объявления и снижение цен по вашим условиям раньше всех.'",
    },
    "uk": {
        "disc_old": "Не пов’язаний із korter.ge.",
        "disc_new": "Не пов’язаний із korter.ge, ss.ge чи myhome.ge.",
        "hero_old_snippet": "'Live monitoring of korter.ge new listings and price drops — matched to your terms, delivered the second they appear.'",
        "hero_new": "'Моніторимо korter.ge, ss.ge та myhome.ge наживо — нові оголошення та знижки за вашими умовами раніше за інших.'",
    },
    "he": {
        "disc_old": "איננו קשורים ל-korter.ge.",
        "disc_new": "איננו קשורים ל-korter.ge, ss.ge או myhome.ge.",
        "hero_old_snippet": "'Live monitoring of korter.ge new listings and price drops — matched to your terms, delivered the second they appear.'",
        "hero_new": "'מעקב חי אחרי korter.ge, ss.ge ו-myhome.ge — מודעות חדשות וירידות מחיר לפי הקריטריונים שלכם, לפני כולם.'",
    },
    "ar": {
        "disc_old": "غير تابعة لـ korter.ge.",
        "disc_new": "غير تابعة لـ korter.ge أو ss.ge أو myhome.ge.",
        "hero_old_snippet": "'Live monitoring of korter.ge new listings and price drops — matched to your terms, delivered the second they appear.'",
        "hero_new": "'مراقبة حية لـ korter.ge و ss.ge و myhome.ge — إعلانات جديدة وخفض أسعار بشروطك، قبل الجميع.'",
    },
}

for code, fix in LOCALES.items():
    p = pathlib.Path(f"src/lib/i18n/{code}.ts")
    s = p.read_text(encoding="utf-8")
    # hero subtitle (the non-en files copy the English string verbatim)
    if fix["hero_old_snippet"] in s:
        s = s.replace(fix["hero_old_snippet"], fix["hero_new"], 1)
        print(code, "hero ok")
    else:
        print(code, "hero SKIP (already localized?)")
    if fix["disc_old"] in s:
        s = s.replace(fix["disc_old"], fix["disc_new"], 1)
        print(code, "disc ok")
    else:
        print(code, "disc SKIP")
    p.write_text(s, encoding="utf-8")
