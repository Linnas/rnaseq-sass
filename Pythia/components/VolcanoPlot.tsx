"use client";

import dynamic from "next/dynamic";
const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

type Row = {
  gene: string;
  log2FC: number;           // log2 fold change
  padj: number;             // adjusted p-value
  neglog10padj?: number;    // optional; if absent we'll compute from padj
};

export default function VolcanoPlot({
  data,
  padjCutoff = 0.05,
  lfcThresh = 1,
  itemLimit = 10000,
  title = "Volcano plot",
}: {
  data: Row[];
  padjCutoff?: number;
  lfcThresh?: number;
  itemLimit?: number;
  title?: string;
}) {
  const yThresh = -Math.log10(padjCutoff);

  // Slice to limit points for speed
  const rows = (data ?? []).slice(0, itemLimit).map(d => {
    const y = d.neglog10padj ?? (d.padj > 0 ? -Math.log10(d.padj) : Infinity);
    const isSig = d.padj <= padjCutoff;
    const up = isSig && d.log2FC >= lfcThresh;
    const down = isSig && d.log2FC <= -lfcThresh;
    const label =
      up ? "Upregulated" :
      down ? "Downregulated" :
      "Non-significant";
    return { ...d, y, label };
  });

  const up = rows.filter(r => r.label === "Upregulated");
  const down = rows.filter(r => r.label === "Downregulated");
  const ns = rows.filter(r => r.label === "Non-significant");

  const mkTrace = (name: string, pts: typeof rows, color: string) => ({
    type: "scattergl",
    mode: "markers",
    name,
    x: pts.map(p => p.log2FC),
    y: pts.map(p => p.y),
    text: pts.map(p => p.gene),
    hovertemplate:
      "<b>%{text}</b><br>" +
      "log2FC=%{x:.3f}<br>" +
      "-log10(padj)=%{y:.3f}<extra></extra>",
    marker: { size: 6, opacity: 0.9, color },
  });

  const traces = [
    mkTrace("Non-significant", ns, "rgba(148,163,184,1)"), // slate-400
    mkTrace("Upregulated",     up, "rgba(239,68,68,1)"),   // red-500
    mkTrace("Downregulated",   down,"rgba(59,130,246,1)"), // blue-500
  ];

  return (
    <Plot
      data={traces as any}
      layout={{
        paper_bgcolor: "rgba(0,0,0,0)",
        plot_bgcolor: "rgba(0,0,0,0)",
        font: { color: "#e5e7eb", family: "Inter, system-ui, sans-serif" },
        xaxis: {
          title: { text: "log2 Fold Change", font: { color: "#e5e7eb", size: 14 } },
          zeroline: false,
          showgrid: false,
          color: "#e5e7eb",
          linecolor: "#9ca3af",
          tickfont: { color: "#e5e7eb", size: 12 },
        },
        yaxis: {
          title: { text: "-log10(padj)", font: { color: "#e5e7eb", size: 14 } },
          rangemode: "tozero",
          automargin: true,
          showgrid: false,
          color: "#e5e7eb",
          linecolor: "#9ca3af",
          tickfont: { color: "#e5e7eb", size: 12 },
        },
        // Threshold lines
        shapes: [
          // horizontal padj threshold
          {
            type: "line",
            xref: "paper",
            x0: 0,
            x1: 1,
            y0: yThresh,
            y1: yThresh,
            line: { dash: "dot", width: 2, color: "rgba(250,204,21,1)" }, // amber-ish
          },
          // vertical +lfc
          {
            type: "line",
            yref: "paper",
            y0: 0,
            y1: 1,
            x0: lfcThresh,
            x1: lfcThresh,
            line: { dash: "dot", width: 2, color: "rgba(250,204,21,1)" },
          },
          // vertical -lfc
          {
            type: "line",
            yref: "paper",
            y0: 0,
            y1: 1,
            x0: -lfcThresh,
            x1: -lfcThresh,
            line: { dash: "dot", width: 2, color: "rgba(250,204,21,1)" },
          },
        ],
        margin: { t: 36, r: 12, b: 48, l: 56 },
        legend: { 
          orientation: "h", 
          x: 0, 
          y: 1.12, 
          font: { color: "#e5e7eb", size: 12 },
          bgcolor: "rgba(0,0,0,0)",
          bordercolor: "rgba(0,0,0,0)",
        },
      } as any}
      config={{
        displaylogo: false,
        responsive: true,
        toImageButtonOptions: { filename: "volcano" },
        modeBarButtonsToRemove: ["lasso2d", "select2d"],
      }}
      style={{ width: "100%", height: "420px" }}
      useResizeHandler
    />
  );
}
