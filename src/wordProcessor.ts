const STOP_WORDS = new Set([
  "a","about","above","after","again","against","all","am","an","and","any",
  "are","aren't","as","at","be","because","been","before","being","below",
  "between","both","but","by","can","can't","cannot","could","couldn't","did",
  "didn't","do","does","doesn't","doing","don't","down","during","each","few",
  "for","from","further","get","got","had","hadn't","has","hasn't","have",
  "haven't","having","he","he'd","he'll","he's","her","here","here's","hers",
  "herself","him","himself","his","how","how's","i","i'd","i'll","i'm","i've",
  "if","in","into","is","isn't","it","it's","its","itself","let's","me","more",
  "most","mustn't","my","myself","no","nor","not","of","off","on","once","only",
  "or","other","ought","our","ours","ourselves","out","over","own","same",
  "shan't","she","she'd","she'll","she's","should","shouldn't","so","some",
  "such","than","that","that's","the","their","theirs","them","themselves",
  "then","there","there's","these","they","they'd","they'll","they're",
  "they've","this","those","through","to","too","under","until","up","very",
  "was","wasn't","we","we'd","we'll","we're","we've","were","weren't","what",
  "what's","when","when's","where","where's","which","while","who","who's",
  "whom","why","why's","will","with","won't","would","wouldn't","you","you'd",
  "you'll","you're","you've","your","yours","yourself","yourselves",
  "also","just","like","one","use","used","using","may","many","much","new",
  "see","two","well","way","even","make","made","first","still","since",
  "back","long","right","take","come","know","said","shall","every",
]);

import type { PageData } from "./pdfParser";

export interface SentenceRef {
  sentence: string;
  page: number;
}

export interface WordEntry {
  text: string;
  count: number;
  sample: SentenceRef | null;
}

export interface CountResult {
  words: WordEntry[];
  totalWords: number;
}

export function countWords(pages: PageData[], maxWords: number): CountResult {
  const freq = new Map<string, number>();
  const refs = new Map<string, SentenceRef[]>();
  let totalWords = 0;

  for (const { page, lines } of pages) {
    for (const line of lines) {
      const tokens = line.toLowerCase().match(/[a-z]{3,}/g) ?? [];
      const seen = new Set<string>();
      const cleaned = line.replace(/^\d+\s+/, "").trim();
      const sentenceParts =
        cleaned.match(/[^.!?]+[.!?]?/g)?.map((s) => s.trim()).filter(Boolean) ??
        [];

      for (const w of tokens) {
        if (STOP_WORDS.has(w)) continue;
        freq.set(w, (freq.get(w) ?? 0) + 1);
        totalWords++;

        // Record each line only once per word
        if (!seen.has(w)) {
          seen.add(w);
          let arr = refs.get(w);
          if (!arr) {
            arr = [];
            refs.set(w, arr);
          }
          const tokenRegex = new RegExp(`\\b${w}\\b`, "i");
          const sentence =
            sentenceParts.find((part) => tokenRegex.test(part)) || cleaned;
          if (sentence.length > 0) {
            arr.push({ sentence, page });
          }
        }
      }
    }
  }

  const words = [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxWords)
    .map(([text, count]) => {
      const candidates = refs.get(text)!;
      const sample = candidates[Math.floor(Math.random() * candidates.length)];
      return { text, count, sample };
    });

  return { words, totalWords };
}
