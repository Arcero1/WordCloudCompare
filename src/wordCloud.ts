import * as d3 from "d3";
import cloud from "d3-cloud";
import type { WordEntry, SentenceRef } from "./wordProcessor";

interface CloudWord {
  text: string;
  size: number;
  count: number;
  sample: SentenceRef | null;
}

let tooltip: d3.Selection<HTMLDivElement, unknown, HTMLElement, unknown> | null =
  null;

function ensureTooltip() {
  if (!tooltip) {
    tooltip = d3
      .select("body")
      .append("div")
      .attr("id", "word-tooltip")
      .style("position", "fixed")
      .style("pointer-events", "none")
      .style("opacity", "0");
  }
  return tooltip;
}

export function renderCloud(
  svgElement: SVGSVGElement,
  words: WordEntry[],
  totalWords: number,
  colorMap: Map<string, string>,
): void {
  if (words.length === 0) return;

  const containerWidth =
    svgElement.parentElement?.clientWidth ?? window.innerWidth - 48;

  // Scale font sizes by percentage of total words
  const total = totalWords || 1;
  const percentages = words.map((w) => w.count / total);
  const maxPct = Math.max(...percentages, 0.001);
  const minPct = Math.min(...percentages, 0);

  // Use generous layout so d3-cloud can place every word
  const layoutSize = 2000;
  let maxFont = Math.min(90, containerWidth / 8);
  let placed: (cloud.Word & CloudWord)[] = [];

  for (let attempt = 0; attempt < 5; attempt++) {
    const fontScale = d3
      .scaleSqrt()
      .domain([minPct, maxPct])
      .range([10, maxFont]);

    const data: CloudWord[] = words.map((w) => ({
      text: w.text,
      size: fontScale(w.count / total),
      count: w.count,
      sample: w.sample,
    }));

    placed = [];
    cloud<CloudWord>()
      .size([layoutSize, layoutSize])
      .words(data)
      .padding(3)
      .rotate(0)
      .font("Inter, Segoe UI, system-ui, sans-serif")
      .fontSize((d) => d.size)
      .spiral("archimedean")
      .on("end", (p) => {
        placed = p as (cloud.Word & CloudWord)[];
      })
      .start();

    if (placed.length >= words.length) break;
    maxFont *= 0.75;
  }

  // Clear and render
  d3.select(svgElement).selectAll("*").remove();
  const tip = ensureTooltip();
  const svg = d3.select(svgElement);
  const g = svg.append("g");

  g.selectAll("text")
    .data(placed)
    .enter()
    .append("text")
    .style("font-size", (d) => `${d.size}px`)
    .style("font-family", "Inter, Segoe UI, system-ui, sans-serif")
    .style("font-weight", (d) => (d.size! > 40 ? "700" : "500"))
    .style("fill", (d) => colorMap.get(d.text!) ?? "#cfd9df")
    .attr("text-anchor", "middle")
    .attr("transform", (d) => `translate(${d.x},${d.y}) rotate(${d.rotate})`)
    .text((d) => d.text!)
    .on("mouseenter", (event: MouseEvent, d) => {
      let html = `<strong>${escapeHtml(d.text!)}</strong> &mdash; ${d.count} occurrence${d.count !== 1 ? "s" : ""}`;
      if (d.sample) {
        html += `<br><span class="tip-quote">&ldquo;${escapeHtml(d.sample.sentence)}&rdquo;</span>`;
        html += `<br><span class="tip-ref">Page ${d.sample.page}, Line ${d.sample.line}</span>`;
      }
      tip
        .html(html)
        .style("left", `${event.clientX + 12}px`)
        .style("top", `${event.clientY + 12}px`)
        .transition()
        .duration(120)
        .style("opacity", "1");
    })
    .on("mousemove", (event: MouseEvent) => {
      tip
        .style("left", `${event.clientX + 12}px`)
        .style("top", `${event.clientY + 12}px`);
    })
    .on("mouseleave", () => {
      tip.transition().duration(200).style("opacity", "0");
    });

  // Tight viewBox from actual rendered bounds
  const gNode = g.node();
  if (gNode) {
    const bbox = gNode.getBBox();
    const pad = 10;
    svg
      .attr(
        "viewBox",
        `${bbox.x - pad} ${bbox.y - pad} ${bbox.width + 2 * pad} ${bbox.height + 2 * pad}`,
      )
      .attr("preserveAspectRatio", "xMidYMid meet");
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
