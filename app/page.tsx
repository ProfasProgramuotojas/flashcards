"use client";

import { useState, useCallback, useMemo } from "react";

// ── Types ──────────────────────────────────────────────────────────────────

interface Flashcard {
  id: string;
  front: string;
  back: string;
  cardType: string;
  flashcardDeckId: string;
}

interface FlashcardDeck {
  topicId: number;
  id: string;
  title: string;
  flashcards: Flashcard[];
}

interface ChildTopic {
  id: number;
  title: string;
  slug: string;
  order: number;
  hidden: boolean;
  flashcardDeckCount: number;
  childTopics?: ChildTopic[];
}

interface Topic {
  id: number;
  title: string;
  slug: string;
  order: number;
  hidden: boolean;
  flashcardDeckCount: number;
  childTopics: ChildTopic[];
}

interface Subject {
  id: number;
  title: string;
  slug: string;
  description: string;
  groupName: string;
  flashcardDeckCount: number;
  topics: Topic[];
}

interface SubjectData {
  result: { data: { json: Subject[] } };
}

type Level = "SL" | "HL";
type Phase = "select-subject" | "select-level" | "select-topics" | "study";

// ── Constants ──────────────────────────────────────────────────────────────

const SUBJECTS = [
  { key: "econ",  label: "Economics",   icon: "📈" },
  { key: "bio",   label: "Biology",     icon: "🧬" },
  { key: "chem",  label: "Chemistry",   icon: "⚗️" },
  { key: "math",  label: "Mathematics", icon: "∑"  },
  { key: "psych",  label: "Psychology", icon: "🧠"  },
];

const LS_PREFIX = "flashdojo_";
const getDoneKey = (subject: string, level: Level) =>
  `${LS_PREFIX}done_${subject}_${level}`;

// ── Level helpers ──────────────────────────────────────────────────────────

/**
 * Returns true if the topic title marks it as HL-only.
 * Patterns: (HL only) | (HL Only) | (HL) | standalone AHL word
 */
function isHLOnly(title: string): boolean {
  return (
    /\(HL[- ]?only\)/i.test(title) ||
    /\(HL\)/i.test(title) ||
    /\bAHL\b/.test(title)
  );
}

/** Should this topic be shown for the chosen level? */
function topicVisibleForLevel(title: string, level: Level): boolean {
  if (isHLOnly(title)) return level === "HL";
  return true;
}

/** Strip HL markers from display titles */
function cleanTitle(title: string): string {
  return title
    .replace(/\s*\(HL[- ]?only\)/gi, "")
    .replace(/\s*\(HL\)/gi, "")
    .replace(/\bAHL\b/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// ── Shuffle ────────────────────────────────────────────────────────────────

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── Component ──────────────────────────────────────────────────────────────

export default function FlashcardApp() {
  const [phase, setPhase] = useState<Phase>("select-subject");
  const [activeSubject, setActiveSubject] = useState<string | null>(null);
  const [activeLevel, setActiveLevel] = useState<Level>("SL");
  const [subjectMeta, setSubjectMeta] = useState<Subject | null>(null);
  const [allDecks, setAllDecks] = useState<FlashcardDeck[]>([]);
  const [selectedTopicIds, setSelectedTopicIds] = useState<Set<number>>(new Set());
  const [loadingMeta, setLoadingMeta] = useState(false);
  const [loadingDecks, setLoadingDecks] = useState(false);

  // Study state
  const [studyQueue, setStudyQueue] = useState<Flashcard[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [doneIds, setDoneIds] = useState<Set<string>>(new Set());
  const [completed, setCompleted] = useState(false);
  const [animating, setAnimating] = useState(false);
  const [cardKey, setCardKey] = useState(0);

  // ── Data loading ─────────────────────────────────────────────────────────

  const loadData = useCallback(async (key: string) => {
    setLoadingMeta(true);
    setLoadingDecks(true);
    try {
      const [metaRes, decksRes] = await Promise.all([
        fetch(`/subjects/${key}.json`),
        fetch(`/flashcards/${key}.json`),
      ]);
      const metaData: SubjectData = await metaRes.json();
      const decksData: FlashcardDeck[] = await decksRes.json();
      setSubjectMeta(metaData.result.data.json[0]);
      setAllDecks(decksData);
    } catch (e) {
      console.error("Failed to load data", e);
    }
    setLoadingMeta(false);
    setLoadingDecks(false);
  }, []);

  // ── Navigation ───────────────────────────────────────────────────────────

  const handleSelectSubject = (key: string) => {
    setActiveSubject(key);
    setSubjectMeta(null);
    setAllDecks([]);
    setSelectedTopicIds(new Set());
    setPhase("select-level");
  };

  const handleSelectLevel = (level: Level) => {
    setActiveLevel(level);
    setSelectedTopicIds(new Set());
    if (activeSubject) loadData(activeSubject);
    setPhase("select-topics");
  };

  // ── Topic tree helpers ───────────────────────────────────────────────────

  const getVisibleIds = useCallback(
    (topic: Topic | ChildTopic, level: Level): number[] => {
      if (!topicVisibleForLevel(topic.title, level)) return [];
      const ids: number[] = [topic.id];
      topic.childTopics?.forEach((c) => ids.push(...getVisibleIds(c, level)));
      return ids;
    },
    []
  );

  const toggleTopic = (topic: Topic | ChildTopic) => {
    const ids = getVisibleIds(topic, activeLevel);
    if (ids.length === 0) return;
    setSelectedTopicIds((prev) => {
      const next = new Set(prev);
      const allSelected = ids.every((id) => next.has(id));
      ids.forEach((id) => (allSelected ? next.delete(id) : next.add(id)));
      return next;
    });
  };

  const selectAll = () => {
    if (!subjectMeta) return;
    const ids: number[] = [];
    subjectMeta.topics.forEach((t) => ids.push(...getVisibleIds(t, activeLevel)));
    setSelectedTopicIds(new Set(ids));
  };

  const selectNone = () => setSelectedTopicIds(new Set());

  // ── Start study ──────────────────────────────────────────────────────────

  const startStudy = () => {
    if (!activeSubject) return;
    const lsKey = getDoneKey(activeSubject, activeLevel);
    const raw = localStorage.getItem(lsKey);
    const persisted: string[] = raw ? JSON.parse(raw) : [];

    const selectedDecks = allDecks.filter((d) => selectedTopicIds.has(d.topicId));
    const allCards: Flashcard[] = selectedDecks.flatMap((d) => d.flashcards);
    const allCardIds = new Set(allCards.map((c) => c.id));
    const done = new Set(persisted.filter((id) => allCardIds.has(id)));

    if (allCards.length > 0 && done.size >= allCards.length) {
      localStorage.removeItem(lsKey);
      done.clear();
    }

    const queue = shuffle(allCards.filter((c) => !done.has(c.id)));
    setDoneIds(done);
    setStudyQueue(queue);
    setCurrentIndex(0);
    setFlipped(false);
    setCompleted(false);
    setCardKey((k) => k + 1);
    setPhase("study");
  };

  // ── Study navigation ─────────────────────────────────────────────────────

  const currentCard = studyQueue[currentIndex] ?? null;

  const markAndAdvance = (known: boolean) => {
    if (!currentCard || animating) return;

    if (known && activeSubject) {
      const newDone = new Set(doneIds).add(currentCard.id);
      setDoneIds(newDone);
      localStorage.setItem(
        getDoneKey(activeSubject, activeLevel),
        JSON.stringify([...newDone])
      );
    }

    setAnimating(true);
    setFlipped(false);
    setTimeout(() => {
      const next = currentIndex + 1;
      if (next >= studyQueue.length) {
        setCompleted(true);
      } else {
        setCurrentIndex(next);
        setCardKey((k) => k + 1);
      }
      setAnimating(false);
    }, 300);
  };

  const progress =
    studyQueue.length > 0 ? (currentIndex / studyQueue.length) * 100 : 0;

  // ── Topic tree renderer ──────────────────────────────────────────────────

  const renderTopics = (topics: (Topic | ChildTopic)[], depth = 0): React.ReactNode =>
    topics.map((t) => {
      if (t.hidden) return null;
      if (!topicVisibleForLevel(t.title, activeLevel)) return null;

      const hlOnly = isHLOnly(t.title);
      const childIds = getVisibleIds(t, activeLevel);
      const allSel = childIds.length > 0 && childIds.every((id) => selectedTopicIds.has(id));
      const someSel = childIds.some((id) => selectedTopicIds.has(id));
      const visibleChildren = (t.childTopics ?? []).filter((c) =>
        topicVisibleForLevel(c.title, activeLevel)
      );

      return (
        <div key={t.id} style={{ paddingLeft: depth * 16 }}>
          <button
            onClick={() => toggleTopic(t)}
            className={`topic-row ${allSel ? "sel-all" : someSel ? "sel-some" : ""}`}
          >
            <span className="topic-check">{allSel ? "✓" : someSel ? "–" : ""}</span>
            <span className="topic-label">
              {cleanTitle(t.title)}
              {hlOnly && <span className="hl-badge">HL</span>}
            </span>
            {visibleChildren.length > 0 && <span className="topic-arrow">›</span>}
          </button>
          {visibleChildren.length > 0 && renderTopics(visibleChildren, depth + 1)}
        </div>
      );
    });

  const selectedCount = useMemo(() => {
    const sel = allDecks.filter((d) => selectedTopicIds.has(d.topicId));
    return sel.reduce((acc, d) => acc + d.flashcards.length, 0);
  }, [allDecks, selectedTopicIds]);

  const subjectLabel = SUBJECTS.find((s) => s.key === activeSubject)?.label ?? "";

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;1,400&family=DM+Sans:wght@300;400;500&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        :root {
          --bg: #0f0f14;
          --surface: #16161e;
          --surface2: #1e1e2a;
          --border: #2a2a3a;
          --accent: #c9a84c;
          --accent-dim: #8a6f2e;
          --text: #e8e4d9;
          --text-muted: #7a7590;
          --green: #4caf7a;
          --hl-color: #7b9cef;
          --hl-bg: rgba(123,156,239,0.1);
          --radius: 12px;
        }

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        body {
          background: var(--bg);
          color: var(--text);
          font-family: 'DM Sans', sans-serif;
          font-weight: 300;
          min-height: 100vh;
          overflow-x: hidden;
        }

        body::before {
          content: '';
          position: fixed;
          inset: 0;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.04'/%3E%3C/svg%3E");
          pointer-events: none;
          z-index: 0;
          opacity: 0.5;
        }

        .app {
          position: relative;
          z-index: 1;
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 48px 24px;
          gap: 40px;
        }

        .header { text-align: center; }
        .header h1 {
          font-family: 'Playfair Display', serif;
          font-size: clamp(2rem, 5vw, 3.5rem);
          font-weight: 400;
          letter-spacing: -0.02em;
        }
        .header h1 em { font-style: italic; color: var(--accent); }
        .header p {
          margin-top: 8px;
          color: var(--text-muted);
          font-size: 0.85rem;
          letter-spacing: 0.1em;
          text-transform: uppercase;
        }

        /* Subject grid */
        .subject-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
          gap: 16px;
          max-width: 680px;
          width: 100%;
        }
        .subject-card {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          padding: 32px 20px;
          cursor: pointer;
          transition: border-color 0.2s, transform 0.2s, background 0.2s;
          text-align: center;
          display: flex;
          flex-direction: column;
          gap: 12px;
          align-items: center;
        }
        .subject-card:hover { border-color: var(--accent); background: var(--surface2); transform: translateY(-2px); }
        .subject-card .icon { font-size: 2.4rem; line-height: 1; }
        .subject-card .label { font-family: 'Playfair Display', serif; font-size: 1.15rem; }

        /* Level selection */
        .level-wrap {
          width: 100%;
          max-width: 440px;
          display: flex;
          flex-direction: column;
          gap: 24px;
          align-items: center;
        }
        .level-heading { text-align: center; }
        .level-heading h2 { font-family: 'Playfair Display', serif; font-size: 1.8rem; font-weight: 400; }
        .level-heading p { margin-top: 6px; color: var(--text-muted); font-size: 0.9rem; }
        .level-cards { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; width: 100%; }
        .level-card {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          padding: 32px 20px;
          cursor: pointer;
          transition: border-color 0.2s, transform 0.2s, background 0.2s;
          display: flex;
          flex-direction: column;
          gap: 10px;
          align-items: center;
          text-align: center;
        }
        .level-card:hover { transform: translateY(-2px); background: var(--surface2); }
        .level-card.sl:hover { border-color: var(--accent); }
        .level-card.hl:hover { border-color: var(--hl-color); }
        .level-badge { font-family: 'Playfair Display', serif; font-size: 2.2rem; font-weight: 700; letter-spacing: -0.03em; }
        .sl .level-badge { color: var(--accent); }
        .hl .level-badge { color: var(--hl-color); }
        .level-desc { font-size: 0.82rem; color: var(--text-muted); line-height: 1.6; }

        /* Level pill */
        .level-pill {
          font-size: 0.72rem;
          font-weight: 500;
          letter-spacing: 0.08em;
          padding: 3px 10px;
          border-radius: 20px;
          border: 1px solid;
          flex-shrink: 0;
        }
        .level-pill.SL { color: var(--accent); border-color: var(--accent-dim); background: rgba(201,168,76,0.08); }
        .level-pill.HL { color: var(--hl-color); border-color: rgba(123,156,239,0.4); background: var(--hl-bg); }

        /* Topics panel */
        .topics-panel {
          width: 100%;
          max-width: 680px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .panel-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 12px;
        }
        .panel-title-row { display: flex; align-items: center; gap: 10px; }
        .panel-title { font-family: 'Playfair Display', serif; font-size: 1.5rem; font-weight: 400; }
        .panel-actions { display: flex; gap: 8px; }

        .btn-ghost {
          background: transparent;
          border: 1px solid var(--border);
          color: var(--text-muted);
          border-radius: 8px;
          padding: 6px 14px;
          font-family: 'DM Sans', sans-serif;
          font-size: 0.85rem;
          cursor: pointer;
          transition: border-color 0.15s, color 0.15s;
        }
        .btn-ghost:hover { border-color: var(--accent); color: var(--accent); }

        .hl-note {
          font-size: 0.82rem;
          color: var(--text-muted);
          padding: 10px 14px;
          background: var(--hl-bg);
          border: 1px solid rgba(123,156,239,0.2);
          border-radius: 8px;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .hl-note .hl-note-badge { color: var(--hl-color); font-weight: 500; }

        .topics-scroll {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          max-height: 420px;
          overflow-y: auto;
          padding: 12px;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .topics-scroll::-webkit-scrollbar { width: 4px; }
        .topics-scroll::-webkit-scrollbar-track { background: transparent; }
        .topics-scroll::-webkit-scrollbar-thumb { background: var(--border); border-radius: 4px; }

        .topic-row {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 8px 10px;
          border-radius: 8px;
          background: transparent;
          border: none;
          color: var(--text);
          cursor: pointer;
          text-align: left;
          width: 100%;
          transition: background 0.15s;
          font-family: 'DM Sans', sans-serif;
          font-size: 0.9rem;
        }
        .topic-row:hover { background: var(--surface2); }
        .topic-row.sel-all { color: var(--accent); }
        .topic-row.sel-some { color: var(--text-muted); }

        .topic-check {
          width: 18px;
          height: 18px;
          border: 1px solid var(--border);
          border-radius: 4px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 0.7rem;
          flex-shrink: 0;
          background: var(--surface2);
          transition: border-color 0.15s, background 0.15s;
        }
        .sel-all .topic-check { border-color: var(--accent); background: var(--accent); color: #000; }
        .sel-some .topic-check { border-color: var(--accent-dim); color: var(--accent-dim); }

        .topic-label { flex: 1; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }

        /* HL badge on HL-only topic rows */
        .hl-badge {
          font-size: 0.63rem;
          font-weight: 600;
          letter-spacing: 0.07em;
          padding: 2px 6px;
          border-radius: 4px;
          color: var(--hl-color);
          background: var(--hl-bg);
          border: 1px solid rgba(123,156,239,0.3);
          flex-shrink: 0;
        }

        .topic-arrow { color: var(--text-muted); font-size: 1.1rem; }

        .start-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 12px;
        }
        .start-info { color: var(--text-muted); font-size: 0.9rem; }
        .start-info strong { color: var(--accent); }

        .btn-primary {
          background: var(--accent);
          color: #0a0800;
          border: none;
          border-radius: 10px;
          padding: 12px 32px;
          font-family: 'Playfair Display', serif;
          font-size: 1.05rem;
          cursor: pointer;
          transition: opacity 0.15s, transform 0.15s;
          letter-spacing: 0.02em;
        }
        .btn-primary:hover { opacity: 0.88; transform: translateY(-1px); }
        .btn-primary:disabled { opacity: 0.35; cursor: not-allowed; transform: none; }

        .btn-back {
          background: transparent;
          border: none;
          color: var(--text-muted);
          cursor: pointer;
          font-family: 'DM Sans', sans-serif;
          font-size: 0.9rem;
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 0;
          transition: color 0.15s;
        }
        .btn-back:hover { color: var(--text); }

        /* Study */
        .study-wrap { width: 100%; max-width: 680px; display: flex; flex-direction: column; gap: 28px; }
        .study-meta { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; }
        .study-meta-left { display: flex; align-items: center; gap: 12px; }
        .study-counter { font-size: 0.85rem; color: var(--text-muted); font-variant-numeric: tabular-nums; }

        .progress-bar { height: 2px; background: var(--border); border-radius: 2px; overflow: hidden; }
        .progress-fill { height: 100%; background: var(--accent); border-radius: 2px; transition: width 0.4s ease; }

        /* Card flip */
        .card-scene { perspective: 1200px; height: 340px; cursor: pointer; }
        @keyframes slideIn {
          from { opacity: 0; transform: translateX(20px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        .card-inner {
          position: relative;
          width: 100%;
          height: 100%;
          transform-style: preserve-3d;
          transition: transform 0.5s cubic-bezier(0.4, 0.2, 0.2, 1);
          animation: slideIn 0.3s ease;
        }
        .card-inner.flipped { transform: rotateY(180deg); }
        .card-face {
          position: absolute;
          inset: 0;
          backface-visibility: hidden;
          -webkit-backface-visibility: hidden;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 16px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 40px;
          text-align: center;
          gap: 16px;
        }
        .card-face.back {
          transform: rotateY(180deg);
          background: var(--surface2);
          border-color: var(--accent-dim);
        }
        .card-tag { font-size: 0.72rem; letter-spacing: 0.12em; text-transform: uppercase; color: var(--text-muted); font-weight: 500; }
        .card-text { font-family: 'Playfair Display', serif; font-size: clamp(1.05rem, 2.5vw, 1.35rem); line-height: 1.6; font-weight: 400; }
        .card-hint { font-size: 0.8rem; color: var(--text-muted); margin-top: 4px; }

        .study-actions { display: flex; gap: 16px; justify-content: center; }
        .btn-know, .btn-again {
          flex: 1;
          max-width: 240px;
          padding: 14px;
          border-radius: 10px;
          border: none;
          cursor: pointer;
          font-family: 'DM Sans', sans-serif;
          font-size: 0.95rem;
          font-weight: 500;
          transition: opacity 0.15s, transform 0.15s;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }
        .btn-know { background: var(--green); color: #fff; }
        .btn-again { background: var(--surface2); border: 1px solid var(--border); color: var(--text); }
        .btn-know:hover, .btn-again:hover { opacity: 0.85; transform: translateY(-1px); }
        .btn-know:disabled, .btn-again:disabled { opacity: 0.3; cursor: not-allowed; transform: none; }

        /* Completed */
        .completed { text-align: center; display: flex; flex-direction: column; align-items: center; gap: 20px; padding: 60px 24px; }
        @keyframes pop { 0% { transform: scale(0.5); opacity: 0; } 70% { transform: scale(1.15); } 100% { transform: scale(1); opacity: 1; } }
        .completed-icon { font-size: 4rem; animation: pop 0.5s ease; }
        .completed h2 { font-family: 'Playfair Display', serif; font-size: 2rem; font-weight: 400; }
        .completed p { color: var(--text-muted); font-size: 0.95rem; line-height: 1.6; }
        .btn-group { display: flex; gap: 12px; flex-wrap: wrap; justify-content: center; margin-top: 8px; }

        .loading { color: var(--text-muted); font-size: 0.9rem; display: flex; align-items: center; gap: 8px; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .spinner { width: 16px; height: 16px; border: 2px solid var(--border); border-top-color: var(--accent); border-radius: 50%; animation: spin 0.7s linear infinite; }
      `}</style>

      <div className="app">
        {/* Header */}
        <div className="header">
          <h1>Flash<em>Dojo</em></h1>
          <p>IB Study Cards</p>
        </div>

        {/* ── Subject Selection ── */}
        {phase === "select-subject" && (
          <div className="subject-grid">
            {SUBJECTS.map((s) => (
              <button key={s.key} className="subject-card" onClick={() => handleSelectSubject(s.key)}>
                <span className="icon">{s.icon}</span>
                <span className="label">{s.label}</span>
              </button>
            ))}
          </div>
        )}

        {/* ── Level Selection ── */}
        {phase === "select-level" && (
          <div className="level-wrap">
            <div className="level-heading">
              <h2>{subjectLabel}</h2>
              <p>Which level are you studying?</p>
            </div>
            <div className="level-cards">
              <button className="level-card sl" onClick={() => handleSelectLevel("SL")}>
                <span className="level-badge">SL</span>
                <span className="level-desc">Standard Level<br />Core topics only</span>
              </button>
              <button className="level-card hl" onClick={() => handleSelectLevel("HL")}>
                <span className="level-badge">HL</span>
                <span className="level-desc">Higher Level<br />Core + HL extensions</span>
              </button>
            </div>
            <button className="btn-back" onClick={() => setPhase("select-subject")}>← Back</button>
          </div>
        )}

        {/* ── Topic Selection ── */}
        {phase === "select-topics" && (
          <div className="topics-panel">
            <div className="panel-header">
              <div className="panel-title-row">
                <button className="btn-back" onClick={() => setPhase("select-level")}>←</button>
                <span className="panel-title">{subjectLabel}</span>
                <span className={`level-pill ${activeLevel}`}>{activeLevel}</span>
              </div>
              <div className="panel-actions">
                <button className="btn-ghost" onClick={selectAll}>All</button>
                <button className="btn-ghost" onClick={selectNone}>Clear</button>
              </div>
            </div>

            {activeLevel === "HL" && (
              <div className="hl-note">
                <span className="hl-badge">HL</span>
                <span>Topics tagged <span className="hl-note-badge">HL</span> are higher-level extensions, not shown in SL mode.</span>
              </div>
            )}

            {loadingMeta || loadingDecks ? (
              <div className="loading"><div className="spinner" /> Loading topics…</div>
            ) : subjectMeta ? (
              <div className="topics-scroll">
                {renderTopics(subjectMeta.topics)}
              </div>
            ) : (
              <div className="loading">Failed to load. Check /public/subjects/ and /public/flashcards/</div>
            )}

            <div className="start-row">
              <span className="start-info">
                <strong>{selectedCount}</strong> cards selected
              </span>
              <button className="btn-primary" disabled={selectedCount === 0} onClick={startStudy}>
                Start Session →
              </button>
            </div>
          </div>
        )}

        {/* ── Study ── */}
        {phase === "study" && (
          <div className="study-wrap">
            {completed ? (
              <div className="completed">
                <span className="completed-icon">🎓</span>
                <h2>All done!</h2>
                <p>
                  You've been through all {studyQueue.length} cards.<br />
                  Cards you marked as known are saved — they'll reset once you've cleared the full set.
                </p>
                <div className="btn-group">
                  <button className="btn-ghost" onClick={() => setPhase("select-topics")}>Change topics</button>
                  <button className="btn-primary" onClick={startStudy}>Restart selection</button>
                  <button className="btn-ghost" onClick={() => setPhase("select-subject")}>New subject</button>
                </div>
              </div>
            ) : currentCard ? (
              <>
                <div className="study-meta">
                  <div className="study-meta-left">
                    <button className="btn-back" onClick={() => setPhase("select-topics")}>← Topics</button>
                    <span className={`level-pill ${activeLevel}`}>{activeLevel}</span>
                  </div>
                  <span className="study-counter">{currentIndex + 1} / {studyQueue.length}</span>
                </div>

                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: `${progress}%` }} />
                </div>

                <div className="card-scene" onClick={() => !animating && setFlipped((f) => !f)}>
                  <div key={cardKey} className={`card-inner ${flipped ? "flipped" : ""}`}>
                    <div className="card-face front">
                      <span className="card-tag">Question</span>
                      <p className="card-text">{currentCard.front}</p>
                      <span className="card-hint">Tap to reveal answer</span>
                    </div>
                    <div className="card-face back">
                      <span className="card-tag">Answer</span>
                      <p className="card-text">{currentCard.back}</p>
                    </div>
                  </div>
                </div>

                <div className="study-actions">
                  <button className="btn-again" disabled={animating} onClick={() => markAndAdvance(false)}>
                    ↩ Again
                  </button>
                  <button className="btn-know" disabled={animating} onClick={() => markAndAdvance(true)}>
                    ✓ Got it
                  </button>
                </div>
              </>
            ) : (
              <div className="loading">No cards remaining in this selection.</div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
