#!/usr/bin/env python3
"""Remove the duplicate 'common.close' entry (second occurrence) from each i18n file."""
import re

for loc in ['en', 'ka', 'ru', 'uk', 'he', 'ar']:
    path = f'/home/z/my-project/src/lib/i18n/{loc}.ts'
    src = open(path).read()
    pat = re.compile(r"^\s*'common\.close': '.*?',$\n", re.M)
    matches = list(pat.finditer(src))
    assert len(matches) == 2, f"{loc}: expected 2 occurrences, found {len(matches)}"
    m = matches[1]  # drop the later duplicate (keep original block position)
    src = src[:m.start()] + src[m.end():]
    open(path, 'w').write(src)
    print(f"{loc}: deduped")
