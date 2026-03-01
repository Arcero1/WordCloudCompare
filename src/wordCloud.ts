import * as d3 from "d3";
import cloud from "d3-cloud";
import type { WordEntry, SentenceRef } from "./wordProcessor";

interface CloudWord {
  text: string;
  size: number;
  count: number;
  sample: SentenceRef | null;
}

export interface CloudHoverPayload {
  text: string;
  count: number;
  sample: SentenceRef | null;
}

export function renderCloud(
  svgElement: SVGSVGElement,
  words: WordEntry[],
  totalWords: number,
  colorMap: Map<string, string>,
  onHover?: (payload: CloudHoverPayload | null) => void,
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
    .on("mouseenter", (_, d) => {
      onHover?.({
        text: d.text!,
        count: d.count,
        sample: d.sample,
      });
    })
    .on("mouseleave", () => {
      onHover?.(null);
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
