# Hebrew glossary and conventions (locales/he.json)

Machine translation by Claude, written for a native reviewer to correct. Keep this file in step with `locales/he.json`.

## Conventions

- **Addressing the writer.** Gender-neutral plural imperative in messages and instructions (לחצו, בחרו, כתבו, גררו, הקלידו, נסו שוב). Menu items and buttons are noun or infinitive phrases, as in Word and macOS in Hebrew (ייצוא…, פתיחה…, הצגת תכונות נוספות). Where English says "I" (the pantser/plotter choice), the Hebrew avoids a gendered first person: "קודם מתווים", "כותבים מהבטן". "Your" is plural-neutral (שלכם).
- **Plurals.** Categories `one`, `two`, `other`. `one` and `two` carry no digit: מילה אחת / שתי מילים / {n} מילים; פרק אחד / שני פרקים; עמוד אחד / שני עמודים. `other` always has `{n}`. Gender follows the noun (מילה f., פרק m., עמוד m., כרטיס m., אהוב m., תסריט m., גופן m., מופע m.). Strings that only mention a number in passing (`{n} today`, `{pages} pages · ~{n} min`) are plain.
- **Latin names.** NEO, NEO Pocket, Word, PDF, EPUB, KDP, Amazon, Fountain, Final Draft, Markdown, iCloud, Syncthing, OpenAI, Finder, Mail, Gmail, Goodreads, file extensions and key names (Esc, Enter, Tab, Shift, Ctrl, ⌘ ⇧ ⌥) stay Latin. A Hebrew prefix is joined with an ASCII hyphen: ל-PDF, מ-NEO, ב-iCloud Drive.
- **Quotation marks (D7 in DECISIONS.md).** The curly pair “…” is used everywhere, unchanged (`“{title}”`), with ‘…’ inside.
- **Abbreviations.** Gershayim and geresh are used where an abbreviation is unavoidable: לפנה״צ, אחה״צ, מ״מ, דק׳. Full words otherwise.
- **Arrows in paths.** Menu paths read "File → Library Folder…" in English; in Hebrew they are written קובץ ← תיקיית הספרייה… (the arrow points the reading direction, right to left).
- **Units.** Inches stay "אינץ׳" (KDP sizes are inches).
- **Left untranslated on purpose:** `NEO LIBRARY CATALOG — which folder is which book` (the heading of a regenerated file, not UI), the key legends `⌘ Command · ⇧ Shift …` and `Ctrl Control · Shift · Alt`, `Command`, `Control`, `Option`, `Shift`, `Enter`, `END` (a literal word printed in a manuscript), `you@example.com`.

## Terms

| English | Hebrew | Note |
|---|---|---|
| Bookshelf | מדף הספרים | The home view. |
| Shelf | מדף | A named group of books on the bookshelf. |
| Book | ספר | |
| Chapter | פרק | |
| Part | חלק | A divider page grouping chapters. |
| Scene | סצנה | |
| Section | קטע | A division inside a chapter (Enter twice). |
| Scene break | הפרדת סצנה | The `***` / `#` between sections. |
| Outline | מתווה | The tab and the notes in it. |
| Card / Outline card | כרטיס / כרטיס מתווה | |
| Loose cards | כרטיסים חופשיים | |
| Notes | הערות | The Notes tab. |
| Darlings | אהובים | From "kill your darlings" (Hebrew: להרוג את האהובים). Singular אהוב. NEO's tab for passages cut but kept. Used as a proper-noun-like tab name, so "באהובים" = in Darlings. See reviewer list. |
| Sprint | ספרינט | |
| Daily goal / Word goal | יעד יומי / יעד מילים | |
| Snapshot | תמונת מצב | |
| Placeholder | ממלא מקום | The "come back to this" mark; plural ממלאי מקום. |
| Sticky | פתק | Not used in the current strings; reserved. |
| Footnote | הערת שוליים | |
| Pen name | שם עט | |
| Manuscript | כתב יד | Also "Manuscript Format" = תבנית כתב יד. |
| Draft | טיוטה | |
| Export / Import | ייצוא / ייבוא | |
| Spellcheck | בדיקת איות | |
| Spellcheck pass | סבב בדיקת איות | |
| Focus mode | מצב מיקוד | |
| Typewriter scrolling | גלילת מכונת כתיבה | |
| Read aloud | הקראה | |
| Drop cap | אות פתיחה | |
| Paperback | כריכה רכה | |
| Trim size | גודל דף | Shown as "Trim:". |
| Bleed | שולי חיתוך | |
| Cover | כריכה | Cover art = תמונת כריכה. |
| Spine | שדרה | |
| Screenplay / Script | תסריט | |
| Scene Heading | כותרת סצנה | |
| Character | דמות | |
| Dialogue | דיאלוג | |
| Parenthetical | הערת משחק | |
| Transition | מעבר | |
| Action | תיאור | Screenplay element. |
| Shot | שוט | |
| Simple NEO | NEO הפשוטה | NEO takes the feminine article in the app's messages (NEO שומרת, NEO תעביר), like an app (אפליקציה). |
| Brighter Interface | ממשק בהיר יותר | |
| Tab (of the window) | לשונית | |
| Library | ספרייה | The NEO Library folder. |
| Trash / Recycle Bin | אשפה / סל המחזור | macOS / Windows. |
| Title page | עמוד שער | |
| Dedication / Epigraph | הקדשה / מוטו | |
| Table of Contents | תוכן עניינים | |
| Pantser / Plotter | כתיבה מהבטן / כתיבה לפי מתווה | |
| Brief / Paint (models) | תקציר / ציור | The text model and the image model in Cover Art. |
| Soft/paper types | שמנת / לבן / נייר עיתון | Cream, white, groundwood. |

## For the native reviewer

Least sure, roughly most important first.

1. **Darlings = "אהובים"** (tab name and everywhere). Is this understood by a Hebrew writer, or is a different name better ("יקירים", "מגירה", "נגזרים")? Awkward in a sentence like "נשמר באהובים".
2. `Saved to Darlings — kill without remorse ({key} to undo)` -> "נשמר באהובים — בלי רגשות אשם": the "kill your darlings" wink is lost.
3. `Are you a pantser or a plotter?` and the two options `Pantser` / `Plotter` ("כתיבה מהבטן" / "כתיבה לפי מתווה"): is there an established Hebrew pair?
4. `I outline first. New books open in the Outline tab.` / `I write by the seat of my pants...`: rephrased impersonally to avoid gender.
5. `Placeholder` = "ממלא מקום" and `Open placeholders` = "ממלאי מקום פתוחים": maybe "סימון" / "תזכורת" reads better; `Resolve` = "טופל".
6. `Resolve` (button beside "Go to" on a placeholder): "טופל" past tense; maybe "סימון כטופל".
7. `Action` = "תיאור" for screenplay action lines; `Shot` = "שוט"; `Parenthetical` = "הערת משחק" (or "הוראת משחק"). Check against Hebrew screenwriting software.
8. `Transition` = "מעבר" collides with Word's wording of other kinds of transitions; the screenplay sense is fine, check.
9. `Scene break` = "הפרדת סצנה" (several strings): alternatives "מעבר סצנה", "מפריד קטעים".
10. `Section` = "קטע" vs `Chapter notes` / `Part` = "חלק": "חלק" can also be read as "section". Check the three levels read clearly together.
11. `Hit {key} while writing to drop a placeholder — a “come back to this” mark that never breaks your flow.`: the natural way to say "never breaks your flow".
12. `Typewriter scrolling` = "גלילת מכונת כתיבה".
13. `Non-Breaking Marks` = "סימנים לא שוברים" (no-break spaces and hyphens): a better term?
14. `Flush paragraph` = "פסקה צמודה לשוליים" (a paragraph with no indent): maybe "פסקה ללא הזחה".
15. `Poetry Paragraph` = "פסקת שירה".
16. `Groundwood` = "נייר עיתון" (cheap paper stock in KDP): is that how Israeli printers say it?
17. `Trim: {w} × {h} in...` = "גודל דף:": printers say "פורמט" or "גודל גזור".
18. `Bleed, cut off` = "שולי חיתוך" in `Pink: bleed, cut off. Red line: trim.` (I wrote "קצה הדף" for trim).
19. `Quality` = "איכות" with `low/medium/high` = "נמוכה/בינונית/גבוהה" (feminine, agrees with איכות).
20. `Brief` = "תקציר" and `Paint` = "ציור" (model fields in Cover Art): meaning inferred from `app.js`.
21. `Hide Others` = "הסתרת האחרות" (macOS wording is "הסתר אחרים").
22. `Undo` = "ביטול הפעולה", `Cancel` = "ביטול", `Redo` = "ביצוע מחדש": check against macOS Hebrew.
23. `Check that the folder exists and that NEO may write to it...`: tone and the "NEO may write" phrasing.
24. `{h} am` / `{h} pm` = "{h} לפנה״צ" / "{h} אחה״צ" (the day-ends-at picker): evening hours read oddly with אחה״צ.
25. `Day ends at` = "היום מסתיים ב-" (sentence-final preposition because the picker follows it).
26. `Anonymous` = "אלמוני": masculine form for all authors.
27. `It was the best of times...` (sample text): a free rendering of Dickens, not the published Hebrew translation. Replace with the established translation if wanted.
28. `INT. PLACE - DAY` = "פנים. מקום - יום": Hebrew screenplays often write "פנים - מקום - יום".
29. `(CONT'D) for a Returning Speaker` = "(המשך)": which word do Hebrew scripts use?
30. `Copyright` page text and `All rights reserved.` ("כל הזכויות שמורות."), and the legal notice for fiction: wording is not legal advice.
31. `Snapshot taken, {time}: ... It's on the Darlings tab.`: the snapshot list lives on the Darlings tab; "תמונת מצב" vs "גרסה שמורה".
32. Plural phrasing in `{n} found` / `{n} selected` ("נמצא אחד / נבחרו שניים"): what noun is counted is not in the string, so the verb gender is a guess.
33. `Services`, `Bring All to Front` (macOS menu): compare with macOS Hebrew.
34. `Write as {name}` / `Writing as {name}` ("כתיבה בשם", "כותבים בשם"): pen-name switching.
35. `Taken by you` = "נוצרה על ידיכם" (snapshot kind: made by the writer).
36. Quotation marks (D7): the English curly pair is kept; Hebrew usually uses straight "…" or „…”.
