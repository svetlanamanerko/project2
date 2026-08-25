import { Sidebar } from '@/components/Sidebar';
import { requireSession } from '@/lib/auth';
import { logoutAction } from '@/app/login/actions';
import { SaveFeedbackToast } from './SaveFeedbackToast';

export const dynamic = 'force-dynamic';

export default async function PrivateLayout({ children }: { children: React.ReactNode }) {
  await requireSession();
  const ownerName = process.env.OWNER_NAME || 'Преподаватель';
  return <div className="app-shell"><Sidebar ownerName={ownerName} logoutAction={logoutAction}/><main className="content">{children}</main><SaveFeedbackToast/></div>;
}
