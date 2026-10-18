/* EMT Study Dashboard — vanilla JavaScript; no network or build step. */
(() => {
  "use strict";
  const PREFIX = "emt_exam_prep_v1_";
  const store = {
    get(key, fallback = null) {
      try {
        const value = localStorage.getItem(PREFIX + key);
        return value ? JSON.parse(value) : fallback;
      } catch (_) {
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(PREFIX + key, JSON.stringify(value));
      } catch (_) {}
    },
    del(key) {
      try {
        localStorage.removeItem(PREFIX + key);
      } catch (_) {}
    }
  };
  const raw = Array.isArray(window.EMT_QUESTIONS) ? window.EMT_QUESTIONS : [];
  const questions = raw
    .filter((q) => q && q.id && q.text)
    .map((q) => ({
      ...q,
      choices: q.choices && typeof q.choices === "object" ? q.choices : {},
      correctAnswer: /^[ABCD]$/.test(q.correctAnswer || "") ? q.correctAnswer : null,
      section: String(q.section),
      number: Number(q.number)
    }));
  const sectionOrder = ["1", "2&3", "2", "3", "4", "5", "6", "7"];
  questions.sort((a, b) => sectionOrder.indexOf(a.section) - sectionOrder.indexOf(b.section) || a.number - b.number);
  const byId = new Map(questions.map((q) => [q.id, q]));
  const SECTION_DEFS = [
    { id: "1", short: "01", name: "Section 1", note: "EMS fundamentals and anatomy" },
    { id: "2&3", short: "02–03", name: "Sections 2 & 3", note: "Combined in the source PDF" },
    { id: "4", short: "04", name: "Section 4", note: "Medical emergencies and cardiac care" },
    { id: "5", short: "05", name: "Section 5", note: "Trauma and environmental emergencies" },
    { id: "6", short: "06", name: "Section 6", note: "OB, pediatrics, and special populations" },
    { id: "7", short: "07", name: "Section 7", note: "Not yet supplied" }
  ];
  const $ = (id) => document.getElementById(id);
  const nodes = ["homeView", "setupView", "quizView", "resultsView"];
  const safe = (value) =>
    String(value == null ? "" : value).replace(
      /[&<>"']/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]
    );
  const choiceKeys = ["A", "B", "C", "D"];
  const hasChoices = (q) => choiceKeys.every((c) => typeof q.choices[c] === "string" && q.choices[c].trim() !== "");
  const gradable = (q) => hasChoices(q) && choiceKeys.includes(q.correctAnswer);
  const group = (section) => questions.filter((q) => q.section === section).sort((a, b) => a.number - b.number);
  const shuffle = (items) => {
    const a = [...items];
    for (let i = a.length - 1; i > 0; i--) {
      const k = Math.floor(Math.random() * (i + 1));
      [a[i], a[k]] = [a[k], a[i]];
    }
    return a;
  };
  let pending = { type: "quick", section: null, ids: null, label: "Quick Random" };
  let session = null;
  let currentResult = null;
  let currentView = "homeView";
  function show(view) {
    nodes.forEach((id) => $(id).classList.toggle("hidden", id !== view));
    currentView = view;
    window.scrollTo({ top: 0, behavior: "instant" });
    $("main").focus({ preventScroll: true });
  }
  function badgeText(q) {
    return `Section ${q.section === "2&3" ? "2 & 3" : q.section} • Question ${q.number}`;
  }
  function saveSession() {
    if (session) store.set("active", session);
  }
  function availableIds() {
    return questions.map((q) => q.id);
  }
  function existingIds(ids) {
    return (ids || []).filter((id) => byId.has(id));
  }
  function setupTheme() {
    const light = store.get("theme") === "light";
    document.documentElement.setAttribute("data-theme", light ? "light" : "dark");
    $("themeButton").textContent = light ? "☾" : "☀";
    $("themeButton").setAttribute("aria-label", light ? "Switch to dark mode" : "Switch to light mode");
  }
  function renderHome() {
    const history = store.get("history", []);
    const overall = questions.length;
    const withAnswers = questions.filter(gradable).length;
    $("stats").innerHTML = `
      <div class="stat-card"><strong>${overall}</strong><span>Questions loaded</span></div>
      <div class="stat-card"><strong>${history.length}</strong><span>Quizzes completed</span></div>
      <div class="stat-card"><strong>${withAnswers}</strong><span>Questions with answer keys</span></div>`;
    $("loadedCount").textContent = `${overall} total questions`;
    $("sectionCards").innerHTML = SECTION_DEFS.map((def) => {
      const num = group(def.id).length;
      return `<button type="button" class="section-card ${!num ? "special" : ""}" ${!num ? "disabled" : ""} data-section="${safe(def.id)}">
        <div class="section-card-top"><span class="section-number">${def.short}</span><span class="section-arrow">${num ? "↗" : "⏳"}</span></div>
        <div><strong>${def.name}</strong><small>${num ? num + " questions available" : def.note}${num && def.id === "2&3" ? " · Combined" : ""}</small></div>
      </button>`;
    }).join("");
    $("sectionCards")
      .querySelectorAll("[data-section]")
      .forEach((btn) => btn.addEventListener("click", () => openSetup("section", btn.dataset.section)));
    document.querySelectorAll("[data-start]").forEach((btn) => (btn.onclick = () => openSetup(btn.dataset.start)));
    const saved = store.get("active");
    const resumeOkay = saved && existingIds(saved.ids).length > 0 && saved.ids.length > 0;
    $("resumeCard").classList.toggle("hidden", !resumeOkay);
    if (resumeOkay) {
      $("resumeTitle").textContent = saved.label || "Continue quiz";
      $("resumeDetails").textContent =
        `${Math.min((saved.index || 0) + 1, saved.ids.length)} of ${saved.ids.length} questions · ${saved.mode === "test" ? "Test" : "Study"} mode`;
    }
  }
  function openSetup(type, section = null, retryIds = null, retryLabel = null) {
    pending = { type, section, ids: retryIds, label: retryLabel || "Custom Quiz" };
    let label, sub, pool;
    if (retryIds) {
      pool = questions.filter((q) => retryIds.includes(q.id));
      label = retryLabel || "Retry questions";
      sub = "Focus on what needs another look.";
    } else if (type === "section") {
      pool = group(section);
      label = section === "2&3" ? "Sections 2 & 3" : `Section ${section}`;
      sub = "Practice only this section.";
    } else if (type === "quick") {
      pool = questions;
      label = "Quick Random";
      sub = "A short quiz drawn from all available questions.";
    } else if (type === "all") {
      pool = questions;
      label = "All Questions";
      sub = "Practice all available questions. Original section/question order is the default.";
    } else {
      pool = questions;
      label = "Custom Quiz";
      sub = "Choose exactly how you want to practice.";
    }
    $("setupTitle").textContent = label;
    $("setupSubtitle").textContent = sub;
    const canCount = type === "quick" || type === "custom" || Boolean(retryIds);
    $("countBlock").classList.toggle("hidden", !canCount);
    $("questionCount").value = type === "quick" ? "10" : type === "custom" ? "20" : String(pool.length);
    $("countHint").textContent = `${pool.length} questions currently available`;
    $("sectionsBlock").classList.toggle("hidden", type !== "custom" || Boolean(retryIds));
    $("sectionChecks").innerHTML = SECTION_DEFS.map((def) => {
      const count = group(def.id).length;
      return `<label><input type="checkbox" data-filter-section="${safe(def.id)}" ${count ? "checked" : "disabled"}><span>${def.name} (${count})</span></label>`;
    }).join("");
    $("shuffleQuestions").checked = type === "quick" || type === "custom";
    $("shuffleQuestions").disabled = type === "quick";
    $("shuffleChoices").checked = true;
    $("setupWarning").classList.add("hidden");
    show("setupView");
  }
  function beginQuiz(ev) {
    ev.preventDefault();
    let pool = [];
    if (pending.ids) pool = questions.filter((q) => pending.ids.includes(q.id));
    else if (pending.type === "section") pool = group(pending.section);
    else if (pending.type === "custom") {
      const selected = [...document.querySelectorAll("#sectionChecks input:checked")].map(
        (i) => i.dataset.filterSection
      );
      pool = questions.filter((q) => selected.includes(q.section));
    } else pool = [...questions];
    const warn = $("setupWarning");
    if (pool.length === 0) {
      warn.textContent = "No questions are available for these sections yet.";
      warn.classList.remove("hidden");
      return;
    }
    const wantsCount = !$("countBlock").classList.contains("hidden");
    let count = pool.length;
    let capMessage = "";
    if (wantsCount) {
      const value = Number($("questionCount").value);
      if (!Number.isInteger(value) || value < 1) {
        warn.textContent = "Please enter a whole number greater than zero.";
        warn.classList.remove("hidden");
        return;
      }
      count = Math.min(value, pool.length);
      if (value > pool.length) {
        capMessage = `You requested ${value} questions, but only ${pool.length} are available. This quiz was capped at ${pool.length}.`;
      }
    }
    const shouldShuffle = $("shuffleQuestions").checked || pending.type === "quick";
    const sample = (shouldShuffle ? shuffle(pool) : pool).slice(0, count);
    const shuffleChoices = $("shuffleChoices").checked;
    const orders = {};
    sample.forEach((q) => (orders[q.id] = shuffleChoices ? shuffle(choiceKeys) : [...choiceKeys]));
    if (store.get("active") && !window.confirm("Replace your saved unfinished quiz with this new quiz?")) return;
    let label = pending.ids
      ? pending.label
      : pending.type === "section"
        ? pending.section === "2&3"
          ? "Sections 2 & 3"
          : `Section ${pending.section}`
        : pending.type === "quick"
          ? "Quick Random"
          : pending.type === "all"
            ? "All Questions"
            : "Custom Quiz";
    session = {
      id: `quiz_${Date.now()}`,
      ids: sample.map((q) => q.id),
      label,
      capMessage,
      mode: document.querySelector('input[name="quizMode"]:checked').value,
      index: 0,
      answers: {},
      crossed: {},
      flags: {},
      orders,
      startedAt: new Date().toISOString()
    };
    saveSession();
    renderQuiz();
    show("quizView");
  }
  function currentQuestion() {
    return session && byId.get(session.ids[session.index]);
  }
  function changeIndex(next) {
    if (!session) return;
    session.index = Math.max(0, Math.min(session.ids.length - 1, next));
    saveSession();
    renderQuiz();
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  function renderQuiz() {
    if (!session) return;
    const q = currentQuestion();
    if (!q) {
      goHome();
      return;
    }
    const len = session.ids.length;
    $("quizLabel").textContent = session.label.toUpperCase();
    $("quizTitle").textContent = "Your practice session";
    $("quizModeBadge").textContent = session.mode === "study" ? "STUDY MODE" : "TEST MODE";
    $("capNotice").classList.toggle("hidden", !session.capMessage);
    $("capNotice").textContent = session.capMessage || "";
    $("progressText").textContent = `Question ${session.index + 1} of ${len}`;
    const answered = session.ids.filter((id) => Boolean(session.answers[id])).length;
    $("answeredText").textContent = `${answered} answered`;
    $("progressFill").style.width = `${((session.index + 1) / len) * 100}%`;
    $("progressTrack").setAttribute("aria-valuenow", String(Math.round(((session.index + 1) / len) * 100)));
    $("questionSection").textContent = badgeText(q).toUpperCase();
    $("questionText").textContent = q.text;
    const flag = Boolean(session.flags[q.id]);
    $("flagButton").setAttribute("aria-pressed", String(flag));
    $("flagButton").textContent = flag ? "⚑ Flagged — remove" : "⚑ Flag for review";
    const warned = q.needsReview || !gradable(q);
    $("questionReview").classList.toggle("hidden", !warned);
    if (warned) {
      $("questionReview").textContent =
        `Question needs review${!gradable(q) ? " and cannot be scored yet" : ""}. ${q.reviewNote || "Compare this OCR transcription and proposed answer with the source PDF before relying on it."}`;
    }
    const imageRoot = $("questionImage");
    imageRoot.replaceChildren();
    if (q.image) {
      const holder = document.createElement("div");
      holder.className = "question-image-frame";
      const image = document.createElement("img");
      image.alt = `Image for ${badgeText(q)}`;
      image.src = q.image;
      const missing = document.createElement("div");
      missing.className = "image-placeholder";
      missing.innerHTML = `IMAGE NEEDED: SECTION ${safe(q.section)}, QUESTION ${q.number}<small>Save the image as ${safe(q.image)} to show it here.</small>`;
      missing.classList.add("hidden");
      image.onload = () => {
        image.classList.remove("hidden");
        missing.classList.add("hidden");
      };
      image.onerror = () => {
        image.classList.add("hidden");
        missing.classList.remove("hidden");
      };
      holder.append(image, missing);
      imageRoot.append(holder);
    }
    const choicesRoot = $("choices");
    choicesRoot.replaceChildren();
    if (!hasChoices(q)) {
      choicesRoot.innerHTML =
        '<div class="empty-quiz">This question was extracted, but one or more answer choices could not be read. Add the choices to <strong>questions.js</strong> to enable practice and scoring.</div>';
    } else {
      const order = session.orders[q.id] || choiceKeys;
      order.forEach((original, i) => {
        const crossed = (session.crossed[q.id] || []).includes(original);
        const chosen = session.answers[q.id] === original;
        const reveal = session.mode === "study" && Boolean(session.answers[q.id]) && gradable(q);
        const row = document.createElement("div");
        row.className = "choice-row";
        row.classList.toggle("is-crossed", crossed);
        row.classList.toggle("is-selected", chosen);
        if (reveal && original === q.correctAnswer) row.classList.add("is-correct");
        if (reveal && chosen && original !== q.correctAnswer) row.classList.add("is-wrong");
        const button = document.createElement("button");
        button.type = "button";
        button.className = "answer-button";
        button.disabled = crossed;
        button.setAttribute("aria-pressed", String(chosen));
        const letter = document.createElement("span");
        letter.className = "answer-letter";
        letter.textContent = choiceKeys[i];
        const content = document.createElement("span");
        content.className = "answer-copy";
        content.textContent = q.choices[original];
        button.append(letter, content);
        button.onclick = () => {
          session.answers[q.id] = original;
          saveSession();
          renderQuiz();
        };
        const x = document.createElement("button");
        x.type = "button";
        x.className = "eliminate";
        x.textContent = "✕";
        x.title = crossed ? "Restore answer choice" : "Cross out answer choice";
        x.setAttribute("aria-label", `${crossed ? "Restore" : "Cross out"} choice ${choiceKeys[i]}`);
        x.setAttribute("aria-pressed", String(crossed));
        x.onclick = () => {
          const arr = session.crossed[q.id] || [];
          session.crossed[q.id] = crossed ? arr.filter((c) => c !== original) : [...arr, original];
          if (!crossed && session.answers[q.id] === original) delete session.answers[q.id];
          saveSession();
          renderQuiz();
        };
        row.append(button, x);
        choicesRoot.append(row);
      });
    }
    const feedback = $("feedback");
    feedback.className = "feedback hidden";
    feedback.replaceChildren();
    const selected = session.answers[q.id];
    if (session.mode === "study" && selected) {
      feedback.classList.remove("hidden");
      if (gradable(q)) {
        const correct = selected === q.correctAnswer;
        feedback.classList.add(correct ? "good" : "bad");
        const visualLetter = choiceKeys[(session.orders[q.id] || choiceKeys).indexOf(q.correctAnswer)];
        const title = document.createElement("strong");
        title.textContent = correct ? "✓ Correct!" : "Not quite — review the answer";
        const content = document.createElement("div");
        content.textContent = `${q.instructorConfirmed ? "Teacher-confirmed answer" : q.answerSource === "User-confirmed (Round 1)" ? "User-confirmed answer" : "Provisional answer"}: ${visualLetter}. ${q.choices[q.correctAnswer]}`;
        feedback.append(title, content);
      } else {
        feedback.textContent =
          "This question has no confirmed or usable answer yet and will be excluded from the graded score.";
      }
    }
    $("prevButton").disabled = session.index === 0;
    $("nextButton").textContent = session.index === len - 1 ? "See results →" : "Next question →";
    $("quizPageCount").textContent = `${session.index + 1} / ${len}`;
    const grid = $("numberGrid");
    grid.replaceChildren();
    session.ids.forEach((id, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "number-button";
      b.textContent = String(i + 1);
      b.setAttribute(
        "aria-label",
        `Jump to question ${i + 1}${session.answers[id] ? ", answered" : ""}${session.flags[id] ? ", flagged" : ""}`
      );
      if (session.answers[id]) b.classList.add("answered");
      if (session.flags[id]) b.classList.add("flagged");
      if (i === session.index) {
        b.classList.add("current");
        b.setAttribute("aria-current", "step");
      }
      b.onclick = () => changeIndex(i);
      grid.append(b);
    });
  }
  function finishQuiz() {
    if (!session) return;
    const list = existingIds(session.ids).map((id) => byId.get(id));
    const gradableItems = list.filter(gradable);
    const correct = gradableItems.filter((q) => session.answers[q.id] === q.correctAnswer);
    const missed = gradableItems.filter((q) => session.answers[q.id] !== q.correctAnswer);
    const ungraded = list.filter((q) => !gradable(q));
    const flagged = list.filter((q) => session.flags[q.id]);
    const retryIds = [...new Set([...missed, ...flagged].map((q) => q.id))];
    currentResult = {
      session: structuredClone(session),
      list,
      gradableItems,
      correct,
      missed,
      ungraded,
      flagged,
      retryIds,
      percentage: gradableItems.length ? Math.round((correct.length / gradableItems.length) * 100) : null
    };
    const history = store.get("history", []);
    history.unshift({
      id: session.id,
      date: new Date().toISOString(),
      label: session.label,
      score: correct.length,
      total: gradableItems.length,
      percentage: currentResult.percentage
    });
    store.set("history", history.slice(0, 40));
    store.del("active");
    session = null;
    renderResults();
    show("resultsView");
  }
  function renderResults() {
    const r = currentResult;
    if (!r) return;
    const percent = r.percentage !== null ? `${r.percentage}%` : "—";
    const content = $("resultsContent");
    content.innerHTML = `<div class="results-hero"><span class="eyebrow">SESSION COMPLETE</span><h1>Quiz results</h1>
      <div class="score-ring"><strong>${percent}</strong><small>${r.correct.length} of ${r.gradableItems.length} correct</small></div>
      <p>${r.missed.length} missed or unanswered · ${r.flagged.length} flagged · ${r.ungraded.length} ungraded</p>
      <div class="result-actions"><button class="primary-button" type="button" id="retryButton" ${r.retryIds.length ? "" : "disabled"}>Retry missed + flagged →</button>
      <button class="outline-button" type="button" id="resultsAgain">New quiz</button></div></div>
      <section class="result-details"><h2>Questions to review (${r.missed.length})</h2><div id="missedList"></div>
      ${r.ungraded.length ? `<h2>Questions not graded (${r.ungraded.length})</h2><div id="ungradedList"></div>` : ""}</section>`;
    $("resultsAgain").onclick = goHome;
    $("retryButton").onclick = () => openSetup("retry", null, r.retryIds, "Retry missed + flagged");
    const missed = $("missedList");
    if (!r.missed.length)
      missed.innerHTML =
        '<div class="result-noitems">No missed questions among those with proposed answer keys. Great work!</div>';
    else
      r.missed.forEach((q) => {
        const div = document.createElement("article");
        div.className = "result-item";
        const userAnswer = r.session.answers[q.id];
        const text = userAnswer ? `${userAnswer}. ${q.choices[userAnswer]}` : "Not answered";
        div.innerHTML = `<strong>${safe(badgeText(q))}</strong><p>${safe(q.text)}</p><small>Your answer: ${safe(text)}</small><small>${q.instructorConfirmed ? "Teacher-confirmed answer" : q.answerSource === "User-confirmed (Round 1)" ? "User-confirmed answer" : "Provisional answer"}: ${safe(q.correctAnswer)}. ${safe(q.choices[q.correctAnswer])}</small>${q.needsReview ? "<small>⚠ OCR or answer may need review</small>" : ""}`;
        missed.append(div);
      });
    const ungraded = $("ungradedList");
    if (ungraded)
      r.ungraded.forEach((q) => {
        const div = document.createElement("div");
        div.className = "result-item";
        div.innerHTML = `<strong>${safe(badgeText(q))}</strong><p>${safe(q.text)}</p><small>Cannot score until the transcription or correct answer is updated.</small>`;
        ungraded.append(div);
      });
  }
  function goHome() {
    if (
      currentView === "quizView" &&
      session &&
      !window.confirm("Return to dashboard? Your quiz is saved and can be resumed.")
    )
      return;
    renderHome();
    show("homeView");
  }
  $("themeButton").addEventListener("click", () => {
    store.set("theme", document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light");
    setupTheme();
  });
  $("homeButton").addEventListener("click", goHome);
  $("setupBack").onclick = goHome;
  $("quizExit").onclick = goHome;
  $("resultsHome").onclick = goHome;
  $("setupForm").addEventListener("submit", beginQuiz);
  $("prevButton").onclick = () => changeIndex(session.index - 1);
  $("nextButton").onclick = () => {
    if (session.index === session.ids.length - 1) finishQuiz();
    else changeIndex(session.index + 1);
  };
  $("finishEarly").onclick = () => {
    if (window.confirm("Finish and score this quiz now? Unanswered questions count as missed.")) finishQuiz();
  };
  $("navFinish").onclick = () => {
    if (window.confirm("Finish and score this quiz now? Unanswered questions count as missed.")) finishQuiz();
  };
  $("flagButton").onclick = () => {
    const id = currentQuestion().id;
    session.flags[id] = !session.flags[id];
    saveSession();
    renderQuiz();
  };
  $("resumeButton").onclick = () => {
    const saved = store.get("active");
    if (!saved) return;
    const ids = existingIds(saved.ids);
    if (!ids.length) {
      store.del("active");
      goHome();
      return;
    }
    session = {
      ...saved,
      ids,
      answers: saved.answers || {},
      crossed: saved.crossed || {},
      flags: saved.flags || {},
      orders: saved.orders || {}
    };
    session.index = Math.max(0, Math.min(ids.length - 1, session.index || 0));
    renderQuiz();
    show("quizView");
  };
  $("discardButton").onclick = () => {
    if (window.confirm("Discard the saved quiz?")) {
      store.del("active");
      renderHome();
    }
  };
  setupTheme();
  renderHome();
  show("homeView");
})();
