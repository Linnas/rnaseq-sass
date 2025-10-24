"use client";
import dynamic from "next/dynamic";
const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

type P = { sample: string; PC1: number; PC2: number; group: string };

export default function PCAPlot({ data }: { data: P[] }) {
  const groups = Array.from(new Set(data.map(d => d.group)));
  const traces = groups.map(g => {
    const pts = data.filter(d => d.group === g);
    return {
      x: pts.map(p => p.PC1),
      y: pts.map(p => p.PC2),
      text: pts.map(p => p.sample),
      type: "scatter", mode: "markers", name: String(g),
      hovertemplate: "Sample: %{text}<br>PC1: %{x:.2f}<br>PC2: %{y:.2f}<extra></extra>"
    };
  });
  return (
    <Plot
      data={traces as any}
      layout={{ title: "PCA (VST)", xaxis: { title: "PC1" }, yaxis: { title: "PC2" } }}
      config={{ displaylogo: false, responsive: true, toImageButtonOptions: { filename: "pca" } }}
      style={{ width: "100%", height: 420 }}
    />
  );
}
