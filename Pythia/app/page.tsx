"use client";

import { useEffect, useState } from "react";
import VolcanoPlot from "@/components/VolcanoPlot";
import PCAPlot from "@/components/PCAPlot";
import EnrichDotPlot from "@/components/EnrichDotPlot";
import EnrichBarPlot from "@/components/EnrichBarPlot";
import EnrichTable from "@/components/EnrichTable";
import { createJob, getResults, getStatus, downloadUrl, getGO, getKEGG, downloadEnrichUrl } from "@/lib/api";

type Results = {
  job_id: string;
  params: any;
  volcano: { gene: string; log2FC: number; padj: number; neglog10padj: number; sig: boolean }[];
  pca: { sample: string; PC1: number; PC2: number; group: string }[];
  top_table: Record<string, string | number | null>[];
};
type Enrich = { items: { term:string; description:string; count:number; gene_ratio:number; p_adjust:number; neglog10padj:number }[] };

const ORG = {
  hsa: { goOrgDb: "org.Hs.eg.db", keggOrg: "hsa", label: "Human" },
  mmu: { goOrgDb: "org.Mm.eg.db", keggOrg: "mmu", label: "Mouse" },
} as const;
type OrgKey = keyof typeof ORG;

export default function Home() {
  const [jobId, setJobId] = useState("");
  const [status, setStatus] = useState<"queued"|"running"|"completed"|"">("");
  const [params, setParams] = useState({ padj_cutoff: 0.05, lfc_thresh: 1, top_n: 100, item_limit: 10000, a: "", b: "" });
  const [results, setResults] = useState<Results | null>(null);

  const [enrichMode, setEnrichMode] = useState<"ora"|"gsea">("ora");
  const [goOnt, setGoOnt] = useState<"BP"|"MF"|"CC">("BP");
  const [organism, setOrganism] = useState<OrgKey>("hsa");
  const [view, setView] = useState<"dot"|"bar"|"table">("dot");
  const [goData, setGoData] = useState<Enrich|null>(null);
  const [keggData, setKeggData] = useState<Enrich|null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setResults(null); setGoData(null); setKeggData(null);
    const fd = new FormData(e.currentTarget);
    const { job_id, status } = await createJob(fd);
    setJobId(job_id);
    setStatus(status);
  }

  useEffect(() => {
    if (!jobId) return;
    const t = setInterval(async () => {
      const s = await getStatus(jobId);
      setStatus(s.status);
      if (s.status === "completed") {
        clearInterval(t);
        await refreshResults();
      }
    }, 1200);
    return () => clearInterval(t);
  }, [jobId]);

  async function refreshResults() {
    if (!jobId) return;
    const qs = new URLSearchParams();
    if (params.a) qs.set("a", params.a);
    if (params.b) qs.set("b", params.b);
    qs.set("padj_cutoff", String(params.padj_cutoff));
    qs.set("lfc_thresh", String(params.lfc_thresh));
    qs.set("top_n", String(params.top_n));
    qs.set("item_limit", String(params.item_limit));
    const r = await getResults(jobId, qs);
    setResults(r);
  }

  async function fetchGO() {
    if (!jobId || status !== "completed") return;
    const qs = new URLSearchParams({
      mode: enrichMode, ont: goOnt,
      org_db: ORG[organism].goOrgDb,
      a: params.a || "", b: params.b || "",
      padj_cutoff: String(params.padj_cutoff), lfc_thresh: String(params.lfc_thresh),
      p_cutoff: "0.05", q_cutoff: "0.2", top: "20"
    });
    setGoData(await getGO(jobId, qs));
  }
  async function fetchKEGG() {
    if (!jobId || status !== "completed") return;
    const qs = new URLSearchParams({
      mode: enrichMode, kegg_org: ORG[organism].keggOrg,
      a: params.a || "", b: params.b || "",
      padj_cutoff: String(params.padj_cutoff), lfc_thresh: String(params.lfc_thresh),
      p_cutoff: "0.05", q_cutoff: "0.2", top: "20"
    });
    setKeggData(await getKEGG(jobId, qs));
  }

  return (
    <main id="main" className="mx-auto max-w-7xl px-4 py-8 md:px-6 lg:px-8">
      {/* Header */}
      <header className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-base-50">
          Bulk RNA-seq Analysis
        </h1>
        <p className="mt-1 max-w-3xl text-base text-base-300">
          Upload count + metadata files, run DESeq2 once, then explore results, GO/KEGG enrichment,
          and exports. Designed with high contrast and keyboard-first navigation.
        </p>
      </header>

      {/* Upload / Job form */}
      <section className="card p-5 md:p-6 mb-8" aria-labelledby="upload-title">
        <div className="flex items-center justify-between gap-4">
          <h2 id="upload-title" className="text-lg font-semibold text-base-50">Create analysis job</h2>
          <div
            role="status"
            aria-live="polite"
            className="text-sm font-medium"
          >
            {jobId ? (
              <span className={
                status === "completed" ? "text-okay" :
                status === "running"   ? "text-info" :
                status === "queued"    ? "text-warn" :
                "text-base-400"
              }>
                {status || "idle"}
              </span>
            ) : <span className="text-base-400">no job</span>}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 grid gap-4 md:grid-cols-2" aria-describedby="upload-help">
          <div className="md:col-span-1">
            <label className="block text-sm font-medium text-base-200" htmlFor="counts">
              Counts CSV<span className="sr-only"> (required)</span>
            </label>
            <input
              id="counts" name="counts" type="file" required accept=".csv"
              className="mt-2 block w-full rounded-lg border-base-700 bg-base-800 file:mr-3 file:rounded-md file:border-0 file:bg-base-700 file:px-3 file:py-2 file:text-base-100 hover:file:bg-base-600"
            />
          </div>
          <div className="md:col-span-1">
            <label className="block text-sm font-medium text-base-200" htmlFor="metadata">
              Metadata CSV<span className="sr-only"> (required)</span>
            </label>
            <input
              id="metadata" name="metadata" type="file" required accept=".csv"
              className="mt-2 block w-full rounded-lg border-base-700 bg-base-800 file:mr-3 file:rounded-md file:border-0 file:bg-base-700 file:px-3 file:py-2 file:text-base-100 hover:file:bg-base-600"
            />
          </div>
          <div className="md:col-span-1">
            <label className="block text-sm font-medium text-base-200" htmlFor="design_col">Design column</label>
            <input
              id="design_col" name="design_col" defaultValue="condition"
              className="mt-2 block w-full rounded-lg border-base-700 bg-base-800 text-base-100 placeholder-base-400"
            />
            <p id="upload-help" className="mt-2 text-xs text-base-400">
              The design column must exist in metadata and define your contrast groups (e.g., <code>condition</code>).
            </p>
          </div>
          <div className="md:col-span-1 flex items-end">
            <button
              type="submit"
              className="inline-flex items-center justify-center rounded-lg bg-accent-600 px-4 py-2.5 text-sm font-semibold text-white shadow hover:bg-accent-500 focus-visible:ring-accent-300 disabled:opacity-60 disabled:cursor-not-allowed"
              disabled={status === "running" || status === "queued"}
            >
              Start Job
            </button>
          </div>
        </form>

        {jobId && (
          <p className="mt-3 text-xs text-base-400">
            Job ID: <code className="text-base-200">{jobId}</code>
          </p>
        )}
      </section>

      {/* Parameters */}
      <section className="card p-5 md:p-6 mb-8" aria-labelledby="params-title">
        <div className="flex items-center justify-between">
          <h2 id="params-title" className="text-lg font-semibold text-base-50">Parameters</h2>
          {results && (
            <a
              href={downloadUrl(results.job_id, new URLSearchParams({
                padj_cutoff: String(params.padj_cutoff), lfc_thresh: String(params.lfc_thresh),
                a: params.a || "", b: params.b || ""
              }))}
              target="_blank" rel="noreferrer"
              className="text-sm font-medium text-accent-300 hover:text-accent-200"
            >
              Download DE CSV
            </a>
          )}
        </div>

        <fieldset className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-describedby="param-hint">
          <legend className="sr-only">DE result controls</legend>

          <label className="block">
            <span className="block text-sm text-base-200">padj ≤</span>
            <input
              type="number" step="0.001" value={params.padj_cutoff}
              onChange={e => setParams({ ...params, padj_cutoff: Number(e.target.value) })}
              onBlur={refreshResults}
              className="mt-1 w-full rounded-lg border-base-700 bg-base-800 text-base-100"
            />
          </label>

          <label className="block">
            <span className="block text-sm text-base-200">|log2FC| ≥</span>
            <input
              type="number" step="0.1" value={params.lfc_thresh}
              onChange={e => setParams({ ...params, lfc_thresh: Number(e.target.value) })}
              onBlur={refreshResults}
              className="mt-1 w-full rounded-lg border-base-700 bg-base-800 text-base-100"
            />
          </label>

          <label className="block">
            <span className="block text-sm text-base-200">Top N (table)</span>
            <input
              type="number" value={params.top_n}
              onChange={e => setParams({ ...params, top_n: Number(e.target.value) })}
              onBlur={refreshResults}
              className="mt-1 w-full rounded-lg border-base-700 bg-base-800 text-base-100"
            />
          </label>

          <label className="block">
            <span className="block text-sm text-base-200">Volcano points limit</span>
            <input
              type="number" value={params.item_limit}
              onChange={e => setParams({ ...params, item_limit: Number(e.target.value) })}
              onBlur={refreshResults}
              className="mt-1 w-full rounded-lg border-base-700 bg-base-800 text-base-100"
            />
          </label>

          <label className="block">
            <span className="block text-sm text-base-200">Contrast A (numerator)</span>
            <input
              value={params.a}
              onChange={e => setParams({ ...params, a: e.target.value })}
              onBlur={refreshResults}
              className="mt-1 w-full rounded-lg border-base-700 bg-base-800 text-base-100"
            />
          </label>

          <label className="block">
            <span className="block text-sm text-base-200">Contrast B (denominator)</span>
            <input
              value={params.b}
              onChange={e => setParams({ ...params, b: e.target.value })}
              onBlur={refreshResults}
              className="mt-1 w-full rounded-lg border-base-700 bg-base-800 text-base-100"
            />
          </label>
        </fieldset>
        <p id="param-hint" className="mt-3 text-xs text-base-400">
          Adjust thresholds and contrast; results update on blur to avoid accidental re-queries.
        </p>
      </section>

      {/* Plots */}
      <section className="grid gap-6 md:grid-cols-2 mb-8" aria-label="Diagnostic plots">
        <div className="card p-5 md:p-6">
          <h2 className="text-lg font-semibold text-base-50">Volcano</h2>
          <div className="mt-3" role="img" aria-label="Volcano plot">
            {results ? <VolcanoPlot data={results.volcano} /> : <Placeholder />}
          </div>
        </div>
        <div className="card p-5 md:p-6">
          <h2 className="text-lg font-semibold text-base-50">PCA (VST)</h2>
          <div className="mt-3" role="img" aria-label="PCA plot">
            {results ? <PCAPlot data={results.pca} /> : <Placeholder />}
          </div>
        </div>

        {/* Top table */}
        <div className="md:col-span-2 card p-5 md:p-6">
          <h2 className="text-lg font-semibold text-base-50">Top genes</h2>
          <div className="mt-3 overflow-auto">
            {results && results.top_table?.length > 0 ? (
              <table className="min-w-full text-sm">
                <thead className="bg-base-800 text-base-100">
                  <tr>
                    {Object.keys(results.top_table[0]).map((k) => (
                      <th key={k} scope="col" className="px-3 py-2 text-left font-semibold">
                        {k}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="[&_tr:nth-child(even)]:bg-base-900/60">
                  {results.top_table.map((row, i) => (
                    <tr key={i} className="border-t border-base-800">
                      {Object.entries(row).map(([k, v]) => (
                        <td key={k} className="px-3 py-2 text-base-200">{String(v)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <Placeholder />}
          </div>
        </div>
      </section>

      {/* Enrichment */}
      <section className="card p-5 md:p-6" aria-labelledby="enrich-title">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 id="enrich-title" className="text-lg font-semibold text-base-50">Enrichment</h2>
          <Controls
            enrichMode={enrichMode}
            setEnrichMode={setEnrichMode}
            organism={organism}
            setOrganism={setOrganism}
            goOnt={goOnt}
            setGoOnt={setGoOnt}
            view={view}
            setView={setView}
            fetchGO={fetchGO}
            fetchKEGG={fetchKEGG}
          />
        </div>

        <div className="mt-5 grid gap-6 md:grid-cols-2">
          {/* GO */}
          <div>
            <PanelHeader
              title={`GO ${goOnt}`}
              links={results && goData ? [
                { href: downloadEnrichUrl(results.job_id, "go", new URLSearchParams({
                    mode: enrichMode, ont: goOnt, org_db: ORG[organism].goOrgDb,
                    a: params.a || "", b: params.b || "",
                    padj_cutoff: String(params.padj_cutoff), lfc_thresh: String(params.lfc_thresh)
                  })), label: "CSV" },
                { href: downloadEnrichUrl(results.job_id, "go", new URLSearchParams({
                    mode: enrichMode, ont: goOnt, org_db: ORG[organism].goOrgDb,
                    a: params.a || "", b: params.b || "",
                    padj_cutoff: String(params.padj_cutoff), lfc_thresh: String(params.lfc_thresh),
                    format: "tsv"
                  })), label: "TSV" },
              ] : []}
            />
            <div className="mt-3" role="img" aria-label="GO enrichment plot or table">
              {goData ? (
                view === "dot" ? <EnrichDotPlot items={goData.items} title={`GO ${goOnt} (${enrichMode.toUpperCase()})`} /> :
                view === "bar" ? <EnrichBarPlot items={goData.items} title={`GO ${goOnt} (${enrichMode.toUpperCase()})`} /> :
                <EnrichTable items={goData.items} />
              ) : <Placeholder />}
            </div>
          </div>

          {/* KEGG */}
          <div>
            <PanelHeader
              title={`KEGG (${ORG[organism].keggOrg})`}
              links={results && keggData ? [
                { href: downloadEnrichUrl(results.job_id, "kegg", new URLSearchParams({
                    mode: enrichMode, kegg_org: ORG[organism].keggOrg,
                    a: params.a || "", b: params.b || "",
                    padj_cutoff: String(params.padj_cutoff), lfc_thresh: String(params.lfc_thresh)
                  })), label: "CSV" },
                { href: downloadEnrichUrl(results.job_id, "kegg", new URLSearchParams({
                    mode: enrichMode, kegg_org: ORG[organism].keggOrg,
                    a: params.a || "", b: params.b || "",
                    padj_cutoff: String(params.padj_cutoff), lfc_thresh: String(params.lfc_thresh),
                    format: "tsv"
                  })), label: "TSV" },
              ] : []}
            />
            <div className="mt-3" role="img" aria-label="KEGG enrichment plot or table">
              {keggData ? (
                view === "dot" ? <EnrichDotPlot items={keggData.items} title={`KEGG (${enrichMode.toUpperCase()})`} /> :
                view === "bar" ? <EnrichBarPlot items={keggData.items} title={`KEGG (${enrichMode.toUpperCase()})`} /> :
                <EnrichTable items={keggData.items} />
              ) : <Placeholder />}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

/* ——— small helpers ——— */

function Placeholder() {
  return (
    <div
      className="grid h-64 place-items-center rounded-lg border border-base-800 bg-base-900 text-base-400"
      aria-hidden="true"
    >
      <span className="text-sm">No data yet</span>
    </div>
  );
}

function PanelHeader({ title, links }: { title: string; links: { href: string; label: string }[] }) {
  return (
    <div className="flex items-center justify-between">
      <h3 className="text-base font-semibold text-base-50">{title}</h3>
      {!!links.length && (
        <nav aria-label={`${title} downloads`} className="flex gap-3">
          {links.map(l => (
            <a key={l.label} href={l.href} target="_blank" rel="noreferrer"
               className="rounded-md bg-base-800 px-2.5 py-1.5 text-xs font-medium text-base-100 hover:bg-base-700">
              {l.label}
            </a>
          ))}
        </nav>
      )}
    </div>
  );
}

function Controls(props: {
  enrichMode: "ora" | "gsea"; setEnrichMode: (m:any)=>void;
  organism: any; setOrganism: (o:any)=>void;
  goOnt: "BP"|"MF"|"CC"; setGoOnt: (o:any)=>void;
  view: "dot"|"bar"|"table"; setView: (v:any)=>void;
  fetchGO: () => void; fetchKEGG: () => void;
}) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="text-sm">
        <span className="block text-base-200">Mode</span>
        <select value={props.enrichMode} onChange={e => props.setEnrichMode(e.target.value)}
          className="mt-1 rounded-lg border-base-700 bg-base-800 text-base-100">
          <option value="ora">ORA</option>
          <option value="gsea">GSEA</option>
        </select>
      </label>

      <label className="text-sm">
        <span className="block text-base-200">Organism</span>
        <select value={props.organism} onChange={e => props.setOrganism(e.target.value)}
          className="mt-1 rounded-lg border-base-700 bg-base-800 text-base-100">
          <option value="hsa">Human (hsa)</option>
          <option value="mmu">Mouse (mmu)</option>
        </select>
      </label>

      <label className="text-sm">
        <span className="block text-base-200">GO Ontology</span>
        <select value={props.goOnt} onChange={e => props.setGoOnt(e.target.value as any)}
          className="mt-1 rounded-lg border-base-700 bg-base-800 text-base-100">
          <option>BP</option><option>MF</option><option>CC</option>
        </select>
      </label>

      <label className="text-sm">
        <span className="block text-base-200">View</span>
        <select value={props.view} onChange={e => props.setView(e.target.value as any)}
          className="mt-1 rounded-lg border-base-700 bg-base-800 text-base-100">
          <option value="dot">Dot</option>
          <option value="bar">Count (bar)</option>
          <option value="table">Table</option>
        </select>
      </label>

      <div className="flex gap-2">
        <button onClick={props.fetchGO}
          className="rounded-lg bg-accent-600 px-3 py-2 text-sm font-semibold text-white hover:bg-accent-500">
          Run GO
        </button>
        <button onClick={props.fetchKEGG}
          className="rounded-lg bg-accent-600 px-3 py-2 text-sm font-semibold text-white hover:bg-accent-500">
          Run KEGG
        </button>
      </div>
    </div>
  );
}
