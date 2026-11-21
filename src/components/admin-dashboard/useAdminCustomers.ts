// État, chargement et actions sur les comptes clients (dashboard admin).
import { useState, useEffect } from 'react';
import type { AdminCustomer, AdminCustomerDetail } from '../adminDashboardTypes';
import { askReason } from '../ui/ConfirmSheet';

export function useAdminCustomers({ enabled, showNotice }: { enabled: boolean; showNotice: (msg: string) => void }) {
  const [adminCustomers, setAdminCustomers] = useState<AdminCustomer[]>([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerStatusFilter, setCustomerStatusFilter] = useState<'all' | 'active' | 'suspended'>('all');
  const [customerTotal, setCustomerTotal] = useState(0);
  const [customerPage, setCustomerPage] = useState(0);
  const [customerLoading, setCustomerLoading] = useState(false);
  const [customerActionLoadingId, setCustomerActionLoadingId] = useState<number | null>(null);
  const [customerDetailId, setCustomerDetailId] = useState<number | null>(null);
  const [customerDetail, setCustomerDetail] = useState<AdminCustomerDetail | null>(null);
  const [customerDetailLoading, setCustomerDetailLoading] = useState(false);
  const [customerDetailError, setCustomerDetailError] = useState('');

  const fetchAdminCustomers = async () => {
    try {
      setCustomerLoading(true);
      const params = new URLSearchParams({
        limit: '100',
        offset: String(customerPage * 100),
        search: customerSearch,
        status: customerStatusFilter,
      });
      const response = await fetch(`/api/admin/customers?${params}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Impossible de charger les clients.');
      setAdminCustomers(data.customers || []);
      setCustomerTotal(Number(data.total || 0));
    } catch (error) {
      showNotice(error instanceof Error ? error.message : 'Impossible de charger les clients.');
    } finally {
      setCustomerLoading(false);
    }
  };

  const toggleCustomerDetails = async (customerId: number) => {
    if (customerDetailId === customerId) {
      setCustomerDetailId(null);
      setCustomerDetail(null);
      setCustomerDetailError('');
      return;
    }
    setCustomerDetailId(customerId);
    setCustomerDetail(null);
    setCustomerDetailError('');
    setCustomerDetailLoading(true);
    try {
      const response = await fetch(`/api/admin/customers/${customerId}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Impossible de charger le détail du client.');
      setCustomerDetail(data as AdminCustomerDetail);
    } catch (error) {
      setCustomerDetailError(error instanceof Error ? error.message : 'Impossible de charger le détail du client.');
    } finally {
      setCustomerDetailLoading(false);
    }
  };

  const handleToggleCustomerActive = async (customer: AdminCustomer) => {
    const reason = await askReason(customer.is_active
      ? { title: `Suspendre ${customer.email || `le client #${customer.id}`} ?`, message: 'Ses sessions sont révoquées immédiatement. Le motif est inscrit au journal d’audit.', confirmLabel: 'Suspendre le compte', tone: 'danger', suggestions: ['Commandes abusives', 'Comportement inapproprié', 'Demande du client'] }
      : { title: `Réactiver ${customer.email || `le client #${customer.id}`} ?`, message: 'Le client pourra se reconnecter. Les anciennes sessions restent révoquées.', confirmLabel: 'Réactiver le compte', suggestions: ['Situation régularisée', 'Demande du client', 'Erreur de suspension'] });
    if (reason === null) return;

    setCustomerActionLoadingId(customer.id);
    try {
      const response = await fetch(`/api/admin/customers/${customer.id}/toggle-active`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expected_is_active: customer.is_active, reason }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Impossible de modifier le statut du compte client.');
      const isActive = Boolean(data.is_active);
      setAdminCustomers((current) => current.map((item) => item.id === customer.id
        ? { ...item, is_active: isActive }
        : item));
      setCustomerDetail((current) => current?.customer.id === customer.id
        ? { ...current, customer: { ...current.customer, is_active: isActive } }
        : current);
      showNotice(data.is_active
        ? 'Compte client réactivé. Les anciennes sessions restent révoquées.'
        : 'Compte client suspendu et sessions révoquées.');
    } catch (error) {
      showNotice(error instanceof Error ? error.message : 'Impossible de modifier le statut du compte client.');
    } finally {
      setCustomerActionLoadingId(null);
    }
  };

  useEffect(() => {
    if (enabled) void fetchAdminCustomers();
  }, [enabled, customerSearch, customerStatusFilter, customerPage]);

  return {
    adminCustomers,
    setAdminCustomers,
    customerSearch,
    setCustomerSearch,
    customerStatusFilter,
    setCustomerStatusFilter,
    customerTotal,
    setCustomerTotal,
    customerPage,
    setCustomerPage,
    customerLoading,
    setCustomerLoading,
    customerActionLoadingId,
    setCustomerActionLoadingId,
    customerDetailId,
    setCustomerDetailId,
    customerDetail,
    setCustomerDetail,
    customerDetailLoading,
    setCustomerDetailLoading,
    customerDetailError,
    setCustomerDetailError,
    fetchAdminCustomers,
    toggleCustomerDetails,
    handleToggleCustomerActive,
  };
}
