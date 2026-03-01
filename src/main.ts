import "./style.css";
import { extractPages, type PageData } from "./pdfParser";
import { countWords, type WordEntry, type CountResult } from "./wordProcessor";
import { renderCloud } from "./wordCloud";
import {
  loadPdfForSide,
  removePdfForSide,
  savePdfForSide,
} from "./pdfStorage";

const WORD_COLORS = [
  "#6c63ff", "#ff6584", "#43e97b", "#f8d800",
  "#38f9d7", "#fa709a", "#a18cd1", "#fbc2eb",
  "#fccb90", "#84fab0", "#cfd9df", "#e2d1c3",
];

// --- DOM refs ---
const controls = document.getElementById("controls")!;
const maxWordsInput = document.getElementById("max-words") as HTMLInputElement;
const regenerateBtn = document.getElementById("regenerate-btn")!;
const statusEl = document.getElementById("status")!;
const workspace = document.getElementById("workspace")!;
const wordListEl = document.getElementById("word-list")!;
const selectAllBtn = document.getElementById("select-all-btn")!;
const selectNoneBtn = document.getElementById("select-none-btn")!;
const quoteBoxLeft = document.getElementById("quote-box-left") as HTMLDivElement;
const quoteBoxRight = document.getElementById("quote-box-right") as HTMLDivElement;
const quoteWrapLeft = document.getElementById("quote-wrap-left") as HTMLElement;
const quoteWrapRight = document.getElementById("quote-wrap-right") as HTMLElement;

const sides = ["left", "right"] as const;
type Side = (typeof sides)[number];

interface SideState {
  pages: PageData[];
  words: WordEntry[];
  totalWords: number;
  uploadArea: HTMLElement;
  fileInput: HTMLInputElement;
  container: HTMLElement;
  svg: SVGSVGElement;
}

function initSide(side: Side): SideState {
  return {
    pages: [],
    words: [],
    totalWords: 0,
    uploadArea: document.querySelector(`.upload-area[data-side="${side}"]`)!,
    fileInput: document.getElementById(`pdf-input-${side}`) as HTMLInputElement,
    container: document.getElementById(`cloud-container-${side}`)!,
    svg: document.getElementById(`cloud-svg-${side}`) as unknown as SVGSVGElement,
  };
}

const state: Record<Side, SideState> = {
  left: initSide("left"),
  right: initSide("right"),
};

let hiddenWords = new Set<string>();
let activeHoverWord: string | null = null;

// Merged word list: one entry per unique word, with counts for both sides
interface MergedWord {
  text: string;
  leftCount: number;
  rightCount: number;
  leftEntry: WordEntry | null;
  rightEntry: WordEntry | null;
}
let mergedWords: MergedWord[] = [];

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatQuote(word: string, entry: WordEntry | null): string {
  if (!entry?.sample) {
    return "";
  }
  let html = `<strong>${escapeHtml(word)}</strong> &mdash; ${entry.count} occurrence${entry.count !== 1 ? "s" : ""}`;
  html += `<br><span class="tip-quote">&ldquo;${escapeHtml(entry.sample.sentence)}&rdquo;</span>`;
  html += `<br><span class="tip-ref">Page ${entry.sample.page}</span>`;
  return html;
}

function setQuoteBoxesVisible(visible: boolean) {
  quoteWrapLeft.classList.toggle("hidden", !visible);
  quoteWrapRight.classList.toggle("hidden", !visible);
}

function renderQuoteBoxes(word: string | null) {
  if (!word) {
    quoteBoxLeft.innerHTML = "";
    quoteBoxRight.innerHTML = "";
    setQuoteBoxesVisible(false);
    return;
  }

  const merged = mergedWords.find((w) => w.text === word);
  if (!merged) {
    quoteBoxLeft.innerHTML = "";
    quoteBoxRight.innerHTML = "";
    setQuoteBoxesVisible(false);
    return;
  }

  quoteBoxLeft.innerHTML = formatQuote(word, merged.leftEntry);
  quoteBoxRight.innerHTML = formatQuote(word, merged.rightEntry);
  setQuoteBoxesVisible(true);
}

// --- Status helpers ---
function showStatus(msg: string, isError = false) {
  statusEl.textContent = msg;
  statusEl.classList.remove("hidden", "error");
  if (isError) statusEl.classList.add("error");
}

function hideStatus() {
  statusEl.classList.add("hidden");
}

// --- File handling ---
interface HandleFileOptions {
  persist?: boolean;
}

async function handleFile(
  side: Side,
  file: File,
  options: HandleFileOptions = {},
): Promise<boolean> {
  const { persist = true } = options;

  if (file.type !== "application/pdf") {
    showStatus("Please upload a PDF file.", true);
    return false;
  }

  showStatus("Extracting text from PDF…");

  // Snapshot selected words before switching
  const selectedWords = new Set(
    mergedWords
      .filter((w) => !hiddenWords.has(w.text))
      .map((w) => w.text),
  );

  try {
    const s = state[side];
    s.pages = await extractPages(file);

    if (s.pages.every((p) => p.lines.length === 0)) {
      showStatus("No extractable text found in this PDF.", true);
      return false;
    }

    s.uploadArea.classList.add("loaded");
    const loadedDiv = s.uploadArea.querySelector(".upload-loaded")!;
    const titleSpan = s.uploadArea.querySelector(".upload-title")!;
    loadedDiv.classList.remove("hidden");
    titleSpan.textContent = file.name.replace(/\.pdf$/i, "");

    if (persist) {
      await savePdfForSide(side, file);
    }

    hideStatus();
    generate(selectedWords);
    controls.classList.remove("hidden");
    return true;
  } catch (e) {
    showStatus(
      `Failed to read PDF: ${e instanceof Error ? e.message : e}`,
      true,
    );
    return false;
  }
}

async function restoreSavedPdfs() {
  let restoredAny = false;

  for (const side of sides) {
    const savedFile = await loadPdfForSide(side);
    if (!savedFile) continue;

    restoredAny = true;
    const ok = await handleFile(side, savedFile, { persist: false });
    if (!ok) {
      await removePdfForSide(side);
    }
  }

  if (restoredAny) {
    hideStatus();
  }
}

// --- Core generate ---
function generate(preserveSelected?: Set<string>) {
  const max = parseInt(maxWordsInput.value, 10) || 150;

  // Count words for each side independently
  for (const side of sides) {
    const s = state[side];
    if (s.pages.length > 0) {
      const result: CountResult = countWords(s.pages, max);
      s.words = result.words;
      s.totalWords = result.totalWords;
    } else {
      s.words = [];
      s.totalWords = 0;
    }
  }

  // Merge into a unified word list
  const leftMap = new Map(state.left.words.map((w) => [w.text, w]));
  const rightMap = new Map(state.right.words.map((w) => [w.text, w]));
  const allTexts = new Set([...leftMap.keys(), ...rightMap.keys()]);

  // Carry over previously-selected words that no longer appear
  if (preserveSelected) {
    for (const word of preserveSelected) {
      allTexts.add(word);
    }
    // Clear hidden set; only words that were hidden before and still aren't selected stay hidden
    hiddenWords.clear();
  }

  mergedWords = [...allTexts].map((text) => {
    const le = leftMap.get(text) ?? null;
    const re = rightMap.get(text) ?? null;
    return {
      text,
      leftCount: le?.count ?? 0,
      rightCount: re?.count ?? 0,
      leftEntry: le,
      rightEntry: re,
    };
  });

  // Sort by sum descending; 0-total at bottom
  mergedWords.sort((a, b) => {
    const sumA = a.leftCount + a.rightCount;
    const sumB = b.leftCount + b.rightCount;
    if (sumA === 0 && sumB !== 0) return 1;
    if (sumB === 0 && sumA !== 0) return -1;
    return sumB - sumA;
  });

  workspace.classList.remove("hidden");
  renderPanel();
  renderBothClouds();
}

// --- Render clouds ---
function renderSideCloud(side: Side, colorMap: Map<string, string>) {
  const s = state[side];
  const visible = mergedWords
    .filter((w) => !hiddenWords.has(w.text))
    .map((w) => (side === "left" ? w.leftEntry : w.rightEntry))
    .filter((e): e is WordEntry => e !== null && e.count > 0);

  if (visible.length === 0 || s.pages.length === 0) {
    s.container.classList.add("empty");
    s.svg.style.display = "none";
    return;
  }

  s.container.classList.remove("empty");
  s.svg.style.display = "";
  renderCloud(s.svg, visible, s.totalWords, colorMap, (payload) => {
    activeHoverWord = payload?.text ?? null;
    renderQuoteBoxes(activeHoverWord);
  });
}

function renderBothClouds() {
  const cMap = new Map<string, string>();
  mergedWords.forEach((w, i) => {
    cMap.set(w.text, WORD_COLORS[i % WORD_COLORS.length]);
  });
  for (const side of sides) renderSideCloud(side, cMap);
  renderQuoteBoxes(activeHoverWord);
}

// --- Panel ---
function renderPanel() {
  wordListEl.innerHTML = "";

  // Total row
  const totalItem = document.createElement("div");
  totalItem.className = "word-item word-total";

  const totalLeft = document.createElement("span");
  totalLeft.className = "word-count left";
  totalLeft.textContent = String(state.left.totalWords);

  const totalName = document.createElement("span");
  totalName.className = "word-name";
  totalName.textContent = "Total";

  const totalRight = document.createElement("span");
  totalRight.className = "word-count right";
  totalRight.textContent = String(state.right.totalWords);

  totalItem.appendChild(totalLeft);
  totalItem.appendChild(totalName);
  totalItem.appendChild(totalRight);
  wordListEl.appendChild(totalItem);

  for (const w of mergedWords) {
    const item = document.createElement("div");
    item.className =
      "word-item" + (hiddenWords.has(w.text) ? " hidden-word" : "");

    const leftCount = document.createElement("span");
    leftCount.className = "word-count left";
    leftCount.textContent = String(w.leftCount);

    const name = document.createElement("span");
    name.className = "word-name";
    name.textContent = w.text;

    const rightCount = document.createElement("span");
    rightCount.className = "word-count right";
    rightCount.textContent = String(w.rightCount);

    item.appendChild(leftCount);
    item.appendChild(name);
    item.appendChild(rightCount);
    item.addEventListener("click", () => toggleWord(w.text));
    wordListEl.appendChild(item);
  }
}

function toggleWord(word: string) {
  if (hiddenWords.has(word)) {
    hiddenWords.delete(word);
  } else {
    hiddenWords.add(word);
  }
  renderPanel();
  renderBothClouds();
}

// --- Wire up file inputs + drag/drop for both sides ---
for (const side of sides) {
  const s = state[side];

  s.fileInput.addEventListener("change", () => {
    const file = s.fileInput.files?.[0];
    if (file) {
      void handleFile(side, file);
    }
  });

  s.uploadArea.querySelector(".change-pdf")!.addEventListener("click", (e) => {
    e.preventDefault();
    s.fileInput.click();
  });

  s.uploadArea.addEventListener("dragover", (e) => {
    e.preventDefault();
    s.uploadArea.classList.add("dragover");
  });
  s.uploadArea.addEventListener("dragleave", () => {
    s.uploadArea.classList.remove("dragover");
  });
  s.uploadArea.addEventListener("drop", (e) => {
    e.preventDefault();
    s.uploadArea.classList.remove("dragover");
    const file = e.dataTransfer?.files[0];
    if (file) {
      void handleFile(side, file);
    }
  });
}

// Regenerate
regenerateBtn.addEventListener("click", () => generate());

// Select all / none
selectAllBtn.addEventListener("click", () => {
  hiddenWords.clear();
  renderPanel();
  renderBothClouds();
});
selectNoneBtn.addEventListener("click", () => {
  hiddenWords = new Set(mergedWords.map((w) => w.text));
  renderPanel();
  renderBothClouds();
});

// Re-render on resize
let resizeTimer: ReturnType<typeof setTimeout>;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (state.left.pages.length || state.right.pages.length) renderBothClouds();
  }, 250);
});

void restoreSavedPdfs();
