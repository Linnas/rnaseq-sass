export const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

export async function createJob(formData: FormData) {
  const res = await fetch(`${API_BASE}/jobs`, { method: "POST", body: formData });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
export async function getStatus(id: string) {
  const res = await fetch(`${API_BASE}/jobs/${id}/status`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
export async function getResults(id: string, params: URLSearchParams) {
  const res = await fetch(`${API_BASE}/jobs/${id}/results?` + params.toString());
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
export function downloadUrl(id: string, params: URLSearchParams) {
  return `${API_BASE}/jobs/${id}/download?` + params.toString();
}

export async function getGO(id: string, params: URLSearchParams) {
  const res = await fetch(`${API_BASE}/jobs/${id}/enrich/go?` + params.toString());
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
export async function getKEGG(id: string, params: URLSearchParams) {
  const res = await fetch(`${API_BASE}/jobs/${id}/enrich/kegg?` + params.toString());
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
export function downloadEnrichUrl(id: string, type: "go"|"kegg", params: URLSearchParams) {
  return `${API_BASE}/jobs/${id}/enrich/download?type=${type}&` + params.toString();
}
