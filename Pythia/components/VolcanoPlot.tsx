"use client";
import dynamic from "next/dynamic";
const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

type Point = { gene: string; log2FC: number; padj: number; neglog10padj: number; sig: boolean };

export default function VolcanoPlot({ data }: { data: Point[] }) {
  const sig = data.filter(d => d.sig);
  const nonsig = data.filter(d => !d.sig);
  return (
    <Plot
      data={[
        {
          x: nonsig.map(d => d.log2FC),
          y: nonsig.map(d => d.neglog10padj),
          text: nonsig.map(d => d.gene),
          type: "scattergl", mode: "markers", name: "Not significant",
          hovertemplate: "Gene: %{text}<br>log2FC: %{x:.2f}<br>-log10(padj): %{y:.2f}<extra></extra>"
        },
        {
          x: sig.map(d => d.log2FC),
          y: sig.map(d => d.neglog10padj),
          text: sig.map(d => d.gene),
          type: "scattergl", mode: "markers", name: "Significant",
          hovertemplate: "Gene: %{text}<br>log2FC: %{x:.2f}<br>-log10(padj): %{y:.2f}<extra></extra>"
        }
      ]}
      layout={{ title: "Volcano Plot", xaxis: { title: "log2 fold change" }, yaxis: { title: "-log10(padj)" }, hovermode: "closest" }}
      config={{ displaylogo: false, responsive: true, toImageButtonOptions: { filename: "volcano" } }}
      style={{ width: "100%", height: 520 }}
    />
  );
}
