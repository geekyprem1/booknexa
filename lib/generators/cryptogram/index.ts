/**
 * Cryptogram puzzle book.
 *
 * Each puzzle encodes an inspirational quote with a random letter-substitution
 * cipher; the solver decodes it. A built-in quote bank keeps this fully algorithmic
 * (no AI, no cost). One starter letter is revealed as a hint.
 */

import { escapeHtml } from "../../html/escape";
import { buildInteriorPdf, buildCoverPdf, type InteriorResult, type CoverResult } from "../../pdf";
import type { InteriorPageContent } from "../../pdf/templates/interior";
import type { TrimSize } from "../../pdf/kdp-specs";
import { hashSeed } from "../../util/prng";
import { padToKdpMinimum } from "../notes-pad";

const TRIM: TrimSize = "8.5x11";
export const MIN_CRYPTOGRAM_PUZZLES = 22;

/** ≥60 unique quotes so a max-size book (60) need not repeat. */
const QUOTES: Array<{ text: string; author: string }> = [
  { text: "The only way to do great work is to love what you do", author: "Steve Jobs" },
  { text: "Believe you can and you are halfway there", author: "Theodore Roosevelt" },
  { text: "Do what you can with what you have where you are", author: "Theodore Roosevelt" },
  { text: "Everything you can imagine is real", author: "Pablo Picasso" },
  { text: "In the middle of difficulty lies opportunity", author: "Albert Einstein" },
  { text: "It always seems impossible until it is done", author: "Nelson Mandela" },
  { text: "Happiness depends upon ourselves", author: "Aristotle" },
  { text: "The best way to predict the future is to create it", author: "Peter Drucker" },
  { text: "Quality is not an act it is a habit", author: "Aristotle" },
  { text: "Well done is better than well said", author: "Benjamin Franklin" },
  { text: "The journey of a thousand miles begins with one step", author: "Lao Tzu" },
  { text: "What we think we become", author: "Buddha" },
  { text: "Dream big and dare to fail", author: "Norman Vaughan" },
  { text: "Turn your wounds into wisdom", author: "Oprah Winfrey" },
  { text: "The future belongs to those who believe in their dreams", author: "Eleanor Roosevelt" },
  { text: "A journey is best measured in friends not miles", author: "Tim Cahill" },
  { text: "Little things make big days", author: "Unknown" },
  { text: "Stay hungry stay foolish", author: "Steve Jobs" },
  { text: "Simplicity is the ultimate sophistication", author: "Leonardo da Vinci" },
  { text: "Whatever you are be a good one", author: "Abraham Lincoln" },
  { text: "The secret of getting ahead is getting started", author: "Mark Twain" },
  { text: "Act as if what you do makes a difference it does", author: "William James" },
  { text: "Change your thoughts and you change your world", author: "Norman Vincent Peale" },
  { text: "Life is what happens when you are busy making other plans", author: "John Lennon" },
  { text: "The purpose of our lives is to be happy", author: "Dalai Lama" },
  { text: "Get busy living or get busy dying", author: "Stephen King" },
  { text: "You only live once but if you do it right once is enough", author: "Mae West" },
  { text: "Many of life's failures are people who did not realize how close they were to success", author: "Thomas Edison" },
  { text: "Never let the fear of striking out keep you from playing the game", author: "Babe Ruth" },
  { text: "Courage is grace under pressure", author: "Ernest Hemingway" },
  { text: "Be yourself everyone else is already taken", author: "Oscar Wilde" },
  { text: "That which does not kill us makes us stronger", author: "Friedrich Nietzsche" },
  { text: "I have not failed I have just found ten thousand ways that will not work", author: "Thomas Edison" },
  { text: "Whether you think you can or you think you cannot you are right", author: "Henry Ford" },
  { text: "Do one thing every day that scares you", author: "Eleanor Roosevelt" },
  { text: "We are what we repeatedly do excellence then is not an act but a habit", author: "Will Durant" },
  { text: "If you want to lift yourself up lift up someone else", author: "Booker T Washington" },
  { text: "The only limit to our realization of tomorrow is our doubts of today", author: "Franklin D Roosevelt" },
  { text: "It is never too late to be what you might have been", author: "George Eliot" },
  { text: "Success is not final failure is not fatal it is the courage to continue that counts", author: "Winston Churchill" },
  { text: "What you get by achieving your goals is not as important as what you become", author: "Zig Ziglar" },
  { text: "Keep your face always toward the sunshine and shadows will fall behind you", author: "Walt Whitman" },
  { text: "The mind is everything what you think you become", author: "Buddha" },
  { text: "Opportunity is missed by most people because it is dressed in overalls and looks like work", author: "Thomas Edison" },
  { text: "I cannot change the direction of the wind but I can adjust my sails", author: "Jimmy Dean" },
  { text: "Start where you are use what you have do what you can", author: "Arthur Ashe" },
  { text: "The harder I work the luckier I get", author: "Samuel Goldwyn" },
  { text: "Fall seven times stand up eight", author: "Japanese Proverb" },
  { text: "A person who never made a mistake never tried anything new", author: "Albert Einstein" },
  { text: "If you can dream it you can do it", author: "Walt Disney" },
  { text: "Don't watch the clock do what it does keep going", author: "Sam Levenson" },
  { text: "The best preparation for tomorrow is doing your best today", author: "H Jackson Brown Jr" },
  { text: "You miss one hundred percent of the shots you don't take", author: "Wayne Gretzky" },
  { text: "Strive not to be a success but rather to be of value", author: "Albert Einstein" },
  { text: "I am not a product of my circumstances I am a product of my decisions", author: "Stephen Covey" },
  { text: "When everything seems to be going against you remember the airplane takes off against the wind", author: "Henry Ford" },
  { text: "The two most important days in your life are the day you are born and the day you find out why", author: "Mark Twain" },
  { text: "Nothing will work unless you do", author: "Maya Angelou" },
  { text: "An unexamined life is not worth living", author: "Socrates" },
  { text: "Knowing is not enough we must apply willing is not enough we must do", author: "Johann Wolfgang von Goethe" },
  { text: "Limit your wants and you will increase your wealth", author: "Unknown" },
  { text: "Peace begins with a smile", author: "Mother Teresa" },
  { text: "Do not go where the path may lead go instead where there is no path and leave a trail", author: "Ralph Waldo Emerson" },
  { text: "The greatest glory in living lies not in never falling but in rising every time we fall", author: "Nelson Mandela" },
  { text: "In three words I can sum up everything I have learned about life it goes on", author: "Robert Frost" },
];

export interface CryptogramOptions {
  puzzleCount?: number;
  seed?: number;
  title?: string;
  subtitle?: string;
  author?: string;
}

function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

/** A random substitution cipher where no letter maps to itself (a derangement-ish). */
function makeCipher(rng: () => number): Record<string, string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const shuffled = [...A];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    if (A.every((c, i) => c !== shuffled[i])) {
      const map: Record<string, string> = {};
      A.forEach((c, i) => (map[c] = shuffled[i]));
      return map;
    }
  }
  const map: Record<string, string> = {};
  A.forEach((c, i) => (map[c] = A[(i + 3) % 26]));
  return map;
}

function encodeQuote(quote: string, cipher: Record<string, string>): string {
  return quote.toUpperCase().split("").map((ch) => cipher[ch] ?? ch).join("");
}

function shuffleQuotes<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Most frequent A–Z letter in the quote (ties → first seen). Used as the starter hint. */
function hintLetter(quote: string): string {
  const counts = new Map<string, number>();
  for (const ch of quote.toUpperCase()) {
    if (/[A-Z]/.test(ch)) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  }
  let best = "E";
  let bestN = -1;
  for (const [ch, n] of counts) {
    if (n > bestN) {
      best = ch;
      bestN = n;
    }
  }
  return best;
}

/** Render coded letters with an underline blank beneath each real letter. */
function puzzleHtml(coded: string, hint: { plain: string; code: string }): string {
  const cells = coded.split("").map((ch) => {
    if (!/[A-Z]/.test(ch)) return `<span style="display:inline-block;width:0.16in;text-align:center;vertical-align:top">${ch === " " ? "&nbsp;" : escapeHtml(ch)}</span>`;
    return `<span style="display:inline-block;width:0.24in;text-align:center;vertical-align:top;margin-bottom:0.18in">
      <span style="font-size:12pt;font-weight:bold;letter-spacing:0">${ch}</span><br/>
      <span style="display:inline-block;width:0.2in;border-bottom:1.5px solid #999;height:0.02in">&nbsp;</span>
    </span>`;
  }).join("");
  return `<div style="line-height:2.4;word-break:break-word">${cells}</div>
    <div style="margin-top:0.25in;font-size:10pt;color:#666">Hint: <b>${hint.code}</b> = <b>${hint.plain}</b></div>`;
}

export async function buildCryptogramBook(opts: CryptogramOptions): Promise<{ pageCount: number; puzzles: number; interior: InteriorResult; cover: CoverResult }> {
  const puzzleCount = Math.max(MIN_CRYPTOGRAM_PUZZLES, Math.min(60, Math.round(opts.puzzleCount ?? 30)));
  const seed = opts.seed ?? hashSeed(`cryptogram|${puzzleCount}`);
  const rng = makeRng(seed);

  const title = opts.title?.trim() || "Cryptogram Puzzles";
  const subtitle = opts.subtitle?.trim() || `${puzzleCount} Inspirational Quote Cryptograms`;
  const author = opts.author?.trim() || "BookNexa";

  const pages: InteriorPageContent[] = [
    {
      showPageNumber: false,
      html: `<div style="display:flex;flex-direction:column;height:100%;justify-content:center;align-items:center;text-align:center">
        <h1 style="font-size:34pt;margin:0 0 0.15in">${escapeHtml(title)}</h1>
        <div style="width:2.2in;border-top:2px solid #222;margin:0.14in 0"></div>
        <h2 style="font-weight:normal;color:#444;margin:0;font-size:14pt">${escapeHtml(subtitle)}</h2>
        <div style="margin-top:0.7in;font-size:12pt;color:#333">${escapeHtml(author)}</div>
      </div>`,
    },
  ];

  const solutions: Array<{ text: string; author: string }> = [];
  const order = shuffleQuotes(QUOTES, rng);
  for (let i = 0; i < puzzleCount; i++) {
    const q = order[i % order.length];
    const cipher = makeCipher(rng);
    const coded = encodeQuote(q.text, cipher);
    const plainHint = hintLetter(q.text);
    solutions.push(q);
    pages.push({
      showPageNumber: false,
      html: `<div style="height:100%">
        <div style="display:flex;justify-content:space-between;border-bottom:2px solid #333;padding-bottom:0.06in;margin-bottom:0.25in">
          <div style="font-size:12pt;font-weight:bold;text-transform:uppercase;letter-spacing:0.1em">Cryptogram ${i + 1}</div>
          <div style="font-size:10pt;color:#888">Decode the quote</div>
        </div>
        ${puzzleHtml(coded, { plain: plainHint, code: cipher[plainHint] })}
      </div>`,
    });
  }

  // Answer key — 36 solutions per page. Quotes run 1–3 lines each; a single
  // fixed page holds ~40 and anything beyond that would be clipped by the
  // page's overflow:hidden. Paginate instead.
  const ANSWERS_PER_PAGE = 36;
  for (let start = 0; start < solutions.length; start += ANSWERS_PER_PAGE) {
    const chunk = solutions.slice(start, start + ANSWERS_PER_PAGE);
    const range = solutions.length > ANSWERS_PER_PAGE ? ` (${start + 1}–${start + chunk.length})` : "";
    const ansHtml = chunk
      .map((q, i) => `<div style="margin-bottom:0.1in;font-size:9.5pt"><b>${start + i + 1}.</b> ${escapeHtml(q.text)} — <i>${escapeHtml(q.author)}</i></div>`)
      .join("");
    pages.push({
      showPageNumber: false,
      html: `<div style="height:100%"><h2 style="border-bottom:2px solid #333;padding-bottom:0.06in;margin-bottom:0.12in">Answer Key${range}</h2>${ansHtml}</div>`,
    });
  }

  padToKdpMinimum(pages);
  const pageCount = pages.length;
  const interior = await buildInteriorPdf({ trim: TRIM, pageCount, bleed: false }, pages);
  const cover = await buildCoverPdf({
    trim: TRIM, pageCount, paper: "white",
    content: { title, subtitle, author, backText: `${puzzleCount} inspirational quote cryptograms with a starter hint and full answer key. Hours of brain-teasing fun.` },
  });

  return { pageCount, puzzles: puzzleCount, interior, cover };
}
