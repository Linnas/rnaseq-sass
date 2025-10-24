"use client";
import { useMemo, useState } from "react";
type Item = { term: string; description: string; count: number; gene_ratio: number; p_adjust: number; neglog10padj: number };
type Key = "description"|"count"|"gene_ratio"|"p_adjust"|"neglog10padj";

export default function EnrichTable({ items }: { items: Item[] }) {
  const [sortKey, setSortKey] = useState<Key>("p_adjust");
  const [dir, setDir] = useState<"asc"|"desc">("asc");

  const data = useMemo(() => {
    const arr = [...items];
    arr.sort((a,b) => {
      const va = a[sortKey] as number | string, vb = b[sortKey] as number | string;
      const cmp = (va < vb ? -1 : va > vb ? 1 : 0);
      return dir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [items, sortKey, dir]);

  function header(key: Key, label: string) {
    const active = key === sortKey;
    return (
      <th onClick={() => { setSortKey(key); setDir(active && dir==="asc" ? "desc" : "asc"); }}
          style={{ cursor: "pointer", userSelect: "none", whiteSpace: "nowrap", borderBottom: "1px solid #ddd", padding: 6 }}>
        {label}{active ? (dir==="asc" ? " ▲" : " ▼") : ""}
      </th>
    );
  }

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            {header("description","Term")}
            {header("count","Count")}
            {header("gene_ratio","GeneRatio")}
            {header("p_adjust","padj")}
            {header("neglog10padj","-log10(padj)")}
          </tr>
        </thead>
        <tbody>
          {data.map((r,i) => (
            <tr key={i}>
              <td style={{ padding: 6, borderBottom: "1px solid #f2f2f2" }}>{r.description}</td>
              <td style={{ padding: 6, borderBottom: "1px solid #f2f2f2" }}>{r.count}</td>
              <td style={{ padding: 6, borderBottom: "1px solid #f2f2f2" }}>{r.gene_ratio.toFixed(3)}</td>
              <td style={{ padding: 6, borderBottom: "1px solid #f2f2f2" }}>{Number.isFinite(r.p_adjust) ? (r.p_adjust as number).toExponential(2) : "NA"}</td>
              <td style={{ padding: 6, borderBottom: "1px solid #f2f2f2" }}>{r.neglog10padj.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
