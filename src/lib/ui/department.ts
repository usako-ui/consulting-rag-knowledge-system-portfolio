import type { Department } from '@/lib/auth/session';

export const DEPARTMENT_LABEL: Record<Department, string> = {
  strategy: '戦略部',
  business: '業務部',
  it: 'IT部',
  hr: '人事部',
  sales: '営業部',
  management: '管理部',
};

export function departmentLabel(dept: Department | null | undefined): string {
  if (!dept) return '全部署';
  return DEPARTMENT_LABEL[dept] ?? dept;
}
