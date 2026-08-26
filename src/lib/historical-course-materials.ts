import 'server-only';
import { db } from '@/lib/db';
import { refreshGoogleAccessToken } from '@/lib/google-drive';
import { classifyHistoricalMaterial, type HistoricalMaterialCandidate } from '@/lib/history-bootstrap-utils';

const FOLDER = 'application/vnd.google-apps.folder';
const REQUEST_TIMEOUT_MS = 6_000;
const MAX_REQUESTS = 30;
const MAX_FILES = 400;
const MAX_CANDIDATES = 80;
const MAX_SNIPPET_FILES = 8;
const MAX_SNIPPET_CHARS = 2_500;
const MAX_TOTAL_SNIPPET_CHARS = 12_000;

type DriveItem = { id: string; name: string; mimeType: string; webViewLink?: string; modifiedTime?: string };

async function listFolder(token: string, folderId: string, signal: AbortSignal | undefined, budget: { requests: number }) {
  const result = new Map<string, DriveItem>();
  let pageToken: string | undefined;
  do {
    if (budget.requests >= MAX_REQUESTS) break;
    budget.requests += 1;
    const params = new URLSearchParams({
      q: `'${folderId}' in parents and trashed = false`,
      fields: 'nextPageToken,files(id,name,mimeType,webViewLink,modifiedTime)',
      pageSize: '500', includeItemsFromAllDrives: 'true', supportsAllDrives: 'true',
    });
    if (pageToken) params.set('pageToken', pageToken);
    const requestSignal = signal ? AbortSignal.any([signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)]) : AbortSignal.timeout(REQUEST_TIMEOUT_MS);
    const response = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal: requestSignal });
    if (!response.ok) throw new Error(`Google Drive historical inventory HTTP ${response.status}`);
    const payload = await response.json() as { files?: DriveItem[]; nextPageToken?: string };
    for (const item of payload.files || []) result.set(item.id, item);
    pageToken = payload.nextPageToken;
  } while (pageToken);
  return Array.from(result.values());
}

export async function getCourseHistoricalMaterialCandidates({
  enrollmentId,
  studentId,
  signal,
}: { enrollmentId: string; studentId: string; signal?: AbortSignal }) {
  const rows = await db()<Array<{ folderId: string | null; studentName: string }>>`
    SELECT c.drive_folder_id as "folderId", s.display_name as "studentName"
    FROM enrollments e
    JOIN students s ON s.id=e.student_id AND s.active=true
    JOIN courses c ON c.id=e.course_id AND c.active=true
    WHERE e.id=${enrollmentId} AND e.student_id=${studentId} AND e.active=true LIMIT 1
  `;
  const context = rows[0];
  if (!context?.folderId) return [];

  const token = await refreshGoogleAccessToken();
  const pending = [{ id: context.folderId, path: '' }];
  const visited = new Set<string>();
  const files = new Map<string, HistoricalMaterialCandidate>();
  const budget = { requests: 0 };

  while (pending.length && budget.requests < MAX_REQUESTS && files.size < MAX_FILES) {
    signal?.throwIfAborted();
    const folder = pending.shift()!;
    if (visited.has(folder.id)) continue;
    visited.add(folder.id);
    for (const item of await listFolder(token, folder.id, signal, budget)) {
      const path = [folder.path, item.name].filter(Boolean).join(' / ');
      if (item.mimeType === FOLDER) {
        pending.push({ id: item.id, path });
        continue;
      }
      const candidate = classifyHistoricalMaterial({ id: item.id, title: item.name, path, mimeType: item.mimeType, url: item.webViewLink || null, modifiedTime: item.modifiedTime || null }, context.studentName);
      if (candidate) files.set(candidate.id, candidate);
    }
  }

  if (pending.length) console.warn(`[history-bootstrap] Drive inventory bounded at ${budget.requests} requests, ${visited.size} folders and ${files.size} candidates`);
  return Array.from(files.values())
    .sort((a, b) => {
      const association = Number(b.association === 'student_specific') - Number(a.association === 'student_specific');
      if (association) return association;
      const confidence = { high: 3, medium: 2, low: 1 };
      return confidence[b.confidence] - confidence[a.confidence] || (b.modifiedTime || '').localeCompare(a.modifiedTime || '');
    })
    .slice(0, MAX_CANDIDATES);
}

export async function getHistoricalCandidateSnippets(candidates: HistoricalMaterialCandidate[], signal?: AbortSignal) {
  const readable = candidates.filter((candidate) => candidate.association === 'student_specific' && (
    candidate.mimeType === 'application/vnd.google-apps.document' || candidate.mimeType.startsWith('text/')
  )).slice(0, MAX_SNIPPET_FILES);
  if (!readable.length) return new Map<string, string>();
  const token = await refreshGoogleAccessToken();
  const snippets = new Map<string, string>();
  let total = 0;
  for (const candidate of readable) {
    if (total >= MAX_TOTAL_SNIPPET_CHARS) break;
    const url = candidate.mimeType === 'application/vnd.google-apps.document'
      ? `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(candidate.id)}/export?mimeType=text/plain`
      : `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(candidate.id)}?alt=media`;
    try {
      const requestSignal = signal ? AbortSignal.any([signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)]) : AbortSignal.timeout(REQUEST_TIMEOUT_MS);
      const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal: requestSignal });
      if (!response.ok) continue;
      const remaining = MAX_TOTAL_SNIPPET_CHARS - total;
      const text = (await response.text()).replace(/\s+/g, ' ').trim().slice(0, Math.min(MAX_SNIPPET_CHARS, remaining));
      if (!text) continue;
      snippets.set(candidate.id, text);
      total += text.length;
    } catch (error) {
      console.warn(`[history-bootstrap] Could not extract text from ${candidate.id}:`, error);
    }
  }
  return snippets;
}
