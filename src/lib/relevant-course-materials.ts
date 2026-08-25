import 'server-only';
import { db } from '@/lib/db';
import { refreshGoogleAccessToken } from '@/lib/google-drive';
import { rankByIntent } from '@/lib/learning-context-utils';

type DriveCandidate = { id:string; name:string; mimeType:string; webViewLink?:string; path:string };
const FOLDER='application/vnd.google-apps.folder';
async function list(token:string,parent:string) { const p=new URLSearchParams({q:`'${parent}' in parents and trashed=false`,fields:'files(id,name,mimeType,webViewLink)',pageSize:'1000',includeItemsFromAllDrives:'true',supportsAllDrives:'true'}); const r=await fetch(`https://www.googleapis.com/drive/v3/files?${p}`,{headers:{Authorization:`Bearer ${token}`},cache:'no-store'}); if(!r.ok) throw new Error(`Drive HTTP ${r.status}`); return ((await r.json()) as {files?:Array<{id:string;name:string;mimeType:string;webViewLink?:string}>}).files||[]; }
export async function getRelevantCourseMaterials({courseId,lessonIntent,usedMaterialIds=[],limit=10}:{courseId:string;studentId:string;lessonIntent:Record<string,unknown>;usedMaterialIds?:string[];limit?:number}) {
  const rows=await db()<Array<{folderId:string|null}>>`SELECT drive_folder_id as "folderId" FROM courses WHERE id=${courseId} AND active=true LIMIT 1`; const root=rows[0]?.folderId; if(!root)return [];
  const token=await refreshGoogleAccessToken(); const found:DriveCandidate[]=[]; let frontier=[{id:root,path:''}];
  for(let depth=0;depth<3&&frontier.length;depth++){const next:typeof frontier=[];for(const folder of frontier){for(const item of await list(token,folder.id)){const path=[folder.path,item.name].filter(Boolean).join(' / '); if(item.mimeType===FOLDER)next.push({id:item.id,path}); else found.push({...item,path});}}frontier=next;}
  return rankByIntent(found,lessonIntent,usedMaterialIds,limit);
}
