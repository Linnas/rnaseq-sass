"use client";
import dynamic from "next/dynamic";
const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

type Item = { description: string; count: number; neglog10padj: number };

export default function EnrichBarPlot({ items, title }:{ items: Item[]; title: string }) {
  const y = items.map(i => i.description).reverse();
  const x = items.map(i => i.count).reverse();
  const c = items.map(i => i.neglog10padj).reverse();
  return (
    <Plot
      data={[{ x, y, type: "bar", orientation: "h", text: c.map(v => `-log10(padj)=${v.toFixed(2)}`), hovertemplate: "%{y}<br>Count: %{x}<br>%{text}<extra></extra>" }]}
      layout={{ title, xaxis: { title: "Count" }, yaxis: { title: "Term", automargin: true } }}
      config={{ displaylogo: false, responsive: true, toImageButtonOptions: { filename: "enrich_barplot" } }}
      style={{ width: "100%", height: 520 }}
    />
  );
}
