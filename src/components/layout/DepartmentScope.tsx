import { ShieldCheck } from 'lucide-react';
import { departmentLabel } from '@/lib/ui/department';
import type { Department, UserRole } from '@/lib/auth/session';

interface DepartmentScopeProps {
  department: Department;
  role: UserRole;
}

/**
 * ページ上部に「〇〇部の資料から検索」を明示する境界表示。
 * セキュリティ境界の可視化（architecture.md §5.4）。
 */
export function DepartmentScope({ department, role }: DepartmentScopeProps) {
  const label =
    role === 'admin'
      ? '全部署の資料から検索できます（管理者）'
      : `${departmentLabel(department)}の資料から検索`;
  return (
    <div className="inline-flex items-center gap-2 rounded-full bg-primary-soft px-3 py-1 text-xs font-medium text-primary">
      <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}
