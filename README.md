# E?MT E  Prep — Static Study Website

A mobile-friendly study website that works with **plain HTML, CSS and JavaScript**. It has no backend, login, package manager, build step or internet dependency.

## Quick start

1. Keep `index.html`, `styles.css`, `app.js`, `questions.js` and the `images/` folder together.
2. Double-click **`index.html`** to open it in a modern browser. Most browsers support this directly.
3. If your browser restricts saving progress from `file://` pages, run a tiny local server from this folder instead:

   ```sh
   python -m http.server 8000
   ```

   Then open <http://localhost:8000>. This is *only a local server on your computer*; the website still has no application backend.
4. For free hosting, upload the files to GitHub Pages or any static web host without changing them.

**Progress, crossed-out answers, flags and quiz history** are stored in your browser's `localStorage`. They are not synced between devices or browsers. Clearing your browser site data removes them.

## Current question-bank status

The file `questions.js` contains **384 questions** from the uploaded scanned exam packet, with **382 proposed answers**. Two questions have no reliable listed correct answer. All questions have four choice slots now, but some text was recovered from imperfect OCR. **68 questions are flagged for review**. An orange note appears on those questions in the interface. Do **not** treat all proposed answers as your instructor's official key or as clinical protocols.

The PDF supplied these actual groupings:

| Group | Questions | Status |
|---|---:|---|
| Section 1 | 100 | Loaded |
| Sections 2 & 3 (combined) | 67 | Loaded as one group, not arbitrarily divided |
| Section 4 | 72 | Loaded; Q73–75 missing |
| Section 5 | 75 | Loaded |
| Section 6 | 70 | Loaded; Q71–75 missing |
| Section 7 | 0 | Awaiting exam PDF |

Additionally, **Sections 2 & 3 Q61–68** are missing. The home page's Section 7 card is inactive until you supply questions. To split Section 2 and Section 3 later, change the relevant `section` fields in `questions.js` from `"2&3"` to `"2"` or `"3"` **and** update `SECTION_DEFS` in `app.js` so you have distinct cards.

## Add or correct a question

1. Open `questions.js` with a text editor (VS Code, Notepad++, etc.).
2. Find the question ID, such as `s1-q005` (Section 1, Question 5).
3. Edit the prompt (`text`), each option (`choices.A` through `choices.D`), and `correctAnswer` (one of `"A"`, `"B"`, `"C"`, `"D"` or `null` for unresolved).
4. Set `needsReview` to `false` only after the wording and answer have been verified; use `reviewNote` for any concerns.
5. Save the file and refresh the browser. If you currently have a quiz open, finish it or discard it and start fresh to avoid using a stale set of answer choices.

Example of the object shape inside `window.EMT_QUESTIONS`:

```js
{
  "id": "s7-q001",
  "section": "7",
  "number": 1,
  "text": "Which option is correct?",
  "choices": {"A": "First", "B": "Second", "C": "Third", "D": "Fourth"},
  "correctAnswer": "C",
  "image": null,
  "needsReview": false,
  "reviewNote": "",
  "pdfPage": 1,
  "sourceText": null
}
```

For new questions, add a **comma-separated new object inside the question array** before the closing `];`. Use a unique `id` and preserve the same field names. If the image is not needed, keep `image: null`. You do not have to create a JSON server: `questions.js` is deliberately a plain script so opening `index.html` locally works.

## Included question images

**All nine required source images are included** in `images/`. They are already linked in `questions.js` and should appear above the answer choices. Keep the folder and filenames unchanged when moving or hosting the site.

| Question | Included image | Source PDF page |
|---|---|---:|
| Section 1 Q5 | `images/sec1_q5.png` | 1 |
| Section 1 Q72 | `images/sec1_q72.png` | 6 |
| Section 1 Q83 | `images/sec1_q83.png` | 52 |
| Section 1 Q89 | `images/sec1_q89.png` | 7 |
| Section 1 Q99 | `images/sec1_q99.png` | 8 |
| Section 4 Q65 | `images/sec4_q65.png` (asystole, flatline) | 18 |
| Section 4 Q71 | `images/sec4_q71.png` (ventricular tachycardia) | 39 |
| Section 5 Q29 | `images/sec5_q29.png` | 37 |
| Section 5 Q75 | `images/sec5_q75.png` | 34 |

**ECG filename correction:** The two uploaded ECG images had their question numbers reversed compared with the original exam PDF: PDF Section 4 Q65 shows a flatline (asystole), while PDF Section 4 Q71 shows ventricular tachycardia. The two image *contents* were swapped during installation so the question-to-image pairing is correct and the destination filenames match the question numbers.

For any new image in the future, put it in `images/`, then update the corresponding question's `image` field to a relative path. Missing images still display the `IMAGE NEEDED` placeholder.

## Quiz features

- One question at a time with progress, Previous/Next buttons and a numbered question navigator
- Study mode (immediate proposed-answer feedback) or test mode (feedback at the end)
- Answer choices optionally shuffled **while retaining the correct answer mapping**
- Reversible ✕ answer elimination and question flags, saved with the active quiz
- Section practice, 10-question random quiz, all questions, and custom length/section selection
- Custom requests over the number available are capped and explained on the quiz page
- Results, missed-question review and retry of missed **or** flagged questions
- Dark/light theme and resume unfinished quizzes from browser storage

## Safety of proposed answers

These quizzes are for study, not for live patient care. Some questions were written using older EMS protocols. Where the source wording or current practices are disputed, verify against your course materials, local medical direction, and current guidelines before assigning the final answer. Questions with `correctAnswer: null` appear in the quiz but **are excluded from the graded denominator** and shown separately on the results screen.
