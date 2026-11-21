// État et chargement du journal d’audit admin.
import { useState, useEffect } from 'react';
import type { AdminAuditLog } from '../adminDashboardTypes';
import type { AdminRole } from './shared';

export function useAdminAuditLog(enabled: boolean) {
  const [auditLogs, setAuditLogs] = useState<AdminAuditLog[]>([]);
  const [auditLogTotal, setAuditLogTotal] = useState(0);
  const [auditLogPage, setAuditLogPage] = useState(0);
  const [auditLogSearch, setAuditLogSearch] = useState('');
  const [auditLogActor, setAuditLogActor] = useState<'all' | AdminRole | 'didit_webhook'>('all');
  const [auditLogLoading, setAuditLogLoading] = useState(false);
  const [auditLogError, setAuditLogError] = useState('');
  const [auditLogRefresh, setAuditLogRefresh] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setAuditLogLoading(true);
      setAuditLogError('');
      const params = new URLSearchParams({
        limit: '50',
        offset: String(auditLogPage * 50),
        search: auditLogSearch,
        ...(auditLogActor !== 'all' ? { actor: auditLogActor } : {}),
      });
      try {
        const response = await fetch(`/api/admin/audit-logs?${params}`, { cache: 'no-store', signal: controller.signal });
        const data = await response.json() as { audit_logs?: AdminAuditLog[]; total?: number; error?: string };
        if (!response.ok) throw new Error(data.error || 'Impossible de charger le journal d’audit.');
        setAuditLogs(data.audit_logs || []);
        setAuditLogTotal(Number(data.total || 0));
      } catch (error) {
        if (controller.signal.aborted) return;
        setAuditLogError(error instanceof Error ? error.message : 'Impossible de charger le journal d’audit.');
      } finally {
        if (!controller.signal.aborted) setAuditLogLoading(false);
      }
    }, 200);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [enabled, auditLogPage, auditLogSearch, auditLogActor, auditLogRefresh]);

  return {
    auditLogs,
    setAuditLogs,
    auditLogTotal,
    setAuditLogTotal,
    auditLogPage,
    setAuditLogPage,
    auditLogSearch,
    setAuditLogSearch,
    auditLogActor,
    setAuditLogActor,
    auditLogLoading,
    setAuditLogLoading,
    auditLogError,
    setAuditLogError,
    auditLogRefresh,
    setAuditLogRefresh,
  };
}
