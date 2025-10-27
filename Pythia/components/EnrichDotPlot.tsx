"use client";
import dynamic from "next/dynamic";
const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

type Item = { term: string; description: string; count: number; gene_ratio: number; p_adjust: number; neglog10padj: number };

export default function EnrichDotPlot({ items, title }:{ items: Item[]; title: string }) {
  const y = items.map(i => i.description);
  return (
    <Plot
      data={[{
        x: items.map(i => i.gene_ratio),
        y,
        text: items.map(i => `${i.term}`),
        type: "scatter",
        mode: "markers",
        marker: { size: items.map(i => i.count), color: items.map(i => i.neglog10padj), showscale: true, colorbar: { title: { text: "-log10(padj)" } } },
        hovertemplate: "%{y}<br>GeneRatio: %{x:.2f}<br>Count: %{marker.size}<br>-log10(padj): %{marker.color:.2f}<extra>%{text}</extra>"
      }] as any}
      layout={{ title: { text: title }, xaxis: { title: { text: "GeneRatio" } }, yaxis: { title: { text: "" }, automargin: true } } as any}
      config={{ displaylogo: false, responsive: true, toImageButtonOptions: { filename: "enrich_dotplot" } }}
      style={{ width: "100%", height: 520 }}
    />
  );
}
