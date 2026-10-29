import { useEffect, useState } from 'react';

interface DeliveryZoneOption {
  id: number;
  label: string;
  is_active: boolean;
}

interface DeliverySetupProps {
  zones: DeliveryZoneOption[];
}

interface DeliveryDriver {
  id: number;
  name: string;
  phone: string;
  status: 'pending' | 'active' | 'suspended';
  access_expires_at: string | null;
  zone_ids: number[];
  zones: string[];
}

interface ShopOrigin {
  shop_id: number;
  shop_name: string;
  city: string | null;
  zone_id: number | null;
  zone_label: string | null;
}

async function readJson<T>(response: Response): Promise<T & { error?: string }> {
  return response.json() as Promise<T & { error?: string }>;
}

export function AdminDeliverySetup({ zones }: DeliverySetupProps) {
  const [drivers, setDrivers] = useState<DeliveryDriver[]>([]);
  const [shops, setShops] = useState<ShopOrigin[]>([]);
  const [driverDrafts, setDriverDrafts] = useState<Record<number, { status: DeliveryDriver['status']; zoneIds: number[] }>>({});
  const [originDrafts, setOriginDrafts] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [driversResponse, shopsResponse] = await Promise.all([
        fetch('/api/admin/delivery/drivers', { credentials: 'include', cache: 'no-store' }),
        fetch('/api/admin/delivery/shop-origins', { credentials: 'include', cache: 'no-store' }),
      ]);
      const [driverData, shopData] = await Promise.all([
        readJson<{ drivers: DeliveryDriver[] }>(driversResponse),
        readJson<{ shops: ShopOrigin[] }>(shopsResponse),
      ]);
      if (!driversResponse.ok) throw new Error(driverData.error || 'Impossible de charger les comptes livreurs.');
      if (!shopsResponse.ok) throw new Error(shopData.error || 'Impossible de charger les zones de retrait des boutiques.');
      setDrivers(driverData.drivers);
      setShops(shopData.shops);
      setDriverDrafts(Object.fromEntries(driverData.drivers.map((driver) => [driver.id, {
        status: driver.status,
        zoneIds: driver.zone_ids,
      }])));
      setOriginDrafts(Object.fromEntries(shopData.shops.map((shop) => [shop.shop_id, String(shop.zone_id ?? '')])));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Impossible de charger les données livraison.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const saveDriver = async (driver: DeliveryDriver) => {
    const draft = driverDrafts[driver.id];
    if (!draft) return;
    setSavingKey(`driver-${driver.id}`);
    setError('');
    setNotice('');
    try {
      const response = await fetch(`/api/admin/delivery/drivers/${driver.id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: draft.status, zone_ids: draft.zoneIds }),
      });
      const data = await readJson<{ success: boolean }>(response);
      if (!response.ok) throw new Error(data.error || 'Impossible de mettre à jour ce livreur.');
      setNotice(`Compte de ${driver.name} mis à jour.`);
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Impossible de mettre à jour ce livreur.');
    } finally {
      setSavingKey('');
    }
  };

  const saveOrigin = async (shop: ShopOrigin) => {
    const zoneId = Number(originDrafts[shop.shop_id]);
    if (!Number.isSafeInteger(zoneId) || zoneId <= 0) {
      setError('Choisissez une zone de retrait active.');
      return;
    }
    setSavingKey(`shop-${shop.shop_id}`);
    setError('');
    setNotice('');
    try {
      const response = await fetch(`/api/admin/delivery/shop-origins/${shop.shop_id}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ zone_id: zoneId }),
      });
      const data = await readJson<{ success: boolean }>(response);
      if (!response.ok) throw new Error(data.error || 'Impossible de définir la zone de retrait.');
      setNotice(`Zone de retrait enregistrée pour ${shop.shop_name}.`);
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Impossible de définir la zone de retrait.');
    } finally {
      setSavingKey('');
    }
  };

  return (
    <section aria-labelledby="delivery-setup-title" className="space-y-4 rounded-xl border border-sky-200 bg-sky-50 p-4">
      <header>
        <p className="text-xs font-bold uppercase text-sky-900">Exploitation de la livraison</p>
        <h3 id="delivery-setup-title" className="mt-1 text-sm font-black text-sky-950">Livreurs et zones de retrait</h3>
        <p className="mt-1 text-xs leading-5 text-sky-900">
          Activez les comptes livreurs, autorisez leurs zones et rattachez chaque boutique à sa zone de retrait.
          Le forfait livreur de 1 000 FCFA est réglé par Mobile Money lorsque GeniusPay est configuré.
        </p>
      </header>

      {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-900">{error}</p>}
      {notice && <p role="status" className="rounded-lg border border-emerald-200 bg-white p-3 text-xs font-semibold text-emerald-900">{notice}</p>}
      {loading ? <p role="status" className="rounded-lg border border-sky-200 bg-white p-3 text-xs text-slate-600">Chargement des données livreurs…</p> : (
        <>
          <div className="flex items-center justify-between gap-3">
            <h4 className="text-xs font-black text-slate-900">Comptes livreurs</h4>
            <button type="button" onClick={() => void load()} disabled={Boolean(savingKey)} className="min-h-9 rounded-lg border border-sky-300 bg-white px-3 text-xs font-bold text-sky-950 disabled:opacity-50">Actualiser</button>
          </div>
          {drivers.length === 0 ? <p className="rounded-lg border border-sky-200 bg-white p-3 text-xs text-slate-600">Aucun livreur inscrit pour le moment. Le compte doit d’abord être créé depuis l’espace livreur sur <strong>/livreur</strong>.</p> : (
            <div className="space-y-3">
              {drivers.map((driver) => {
                const draft = driverDrafts[driver.id] || { status: driver.status, zoneIds: driver.zone_ids };
                return (
                  <article key={driver.id} className="rounded-xl border border-sky-200 bg-white p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-black text-slate-900">{driver.name}</p>
                        <p className="text-xs text-slate-600">{driver.phone} · compte {driver.status}{driver.access_expires_at && Date.parse(driver.access_expires_at) > Date.now() ? ' · forfait actif' : ''}</p>
                      </div>
                      <label className="flex items-center gap-2 text-xs font-bold text-slate-700">
                        Statut
                        <select
                          aria-label={`Statut de ${driver.name}`}
                          value={draft.status}
                          onChange={(event) => setDriverDrafts((current) => ({ ...current, [driver.id]: { ...draft, status: event.target.value as DeliveryDriver['status'] } }))}
                          className="min-h-9 rounded-lg border border-slate-300 bg-white px-2"
                        >
                          <option value="pending">En attente</option>
                          <option value="active">Actif</option>
                          <option value="suspended">Suspendu</option>
                        </select>
                      </label>
                    </div>
                    <fieldset className="mt-3">
                      <legend className="text-xs font-bold text-slate-700">Zones attribuées au livreur</legend>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {zones.filter((zone) => zone.is_active).map((zone) => (
                          <label key={zone.id} className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-slate-200 px-2.5 text-xs font-semibold text-slate-700">
                            <input
                              type="checkbox"
                              checked={draft.zoneIds.includes(zone.id)}
                              onChange={(event) => setDriverDrafts((current) => ({
                                ...current,
                                [driver.id]: {
                                  ...draft,
                                  zoneIds: event.target.checked
                                    ? [...draft.zoneIds, zone.id]
                                    : draft.zoneIds.filter((id) => id !== zone.id),
                                },
                              }))}
                            />
                            {zone.label}
                          </label>
                        ))}
                      </div>
                    </fieldset>
                    <button type="button" onClick={() => void saveDriver(driver)} disabled={Boolean(savingKey)} className="mt-3 min-h-10 rounded-lg bg-sky-900 px-4 text-xs font-bold text-white disabled:opacity-50">
                      {savingKey === `driver-${driver.id}` ? 'Enregistrement…' : 'Enregistrer et activer'}
                    </button>
                  </article>
                );
              })}
            </div>
          )}

          <div className="border-t border-sky-200 pt-4">
            <h4 className="text-xs font-black text-slate-900">Zone de retrait des boutiques</h4>
            <p className="mt-1 text-xs leading-5 text-slate-600">Le devis est calculé depuis cette zone vers la zone de destination choisie par le marchand.</p>
            <div className="mt-3 space-y-2">
              {shops.map((shop) => (
                <div key={shop.shop_id} className="flex flex-col gap-2 rounded-lg border border-sky-200 bg-white p-3 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-bold text-slate-800">{shop.shop_name}</p>
                    {shop.city && <p className="text-[11px] text-slate-500">{shop.city}</p>}
                  </div>
                  <label className="sr-only" htmlFor={`delivery-origin-${shop.shop_id}`}>Zone de retrait pour {shop.shop_name}</label>
                  <select
                    id={`delivery-origin-${shop.shop_id}`}
                    value={originDrafts[shop.shop_id] ?? ''}
                    onChange={(event) => setOriginDrafts((current) => ({ ...current, [shop.shop_id]: event.target.value }))}
                    className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-800"
                  >
                    <option value="">Choisir une zone de retrait</option>
                    {zones.filter((zone) => zone.is_active).map((zone) => <option key={zone.id} value={zone.id}>{zone.label}</option>)}
                  </select>
                  <button type="button" onClick={() => void saveOrigin(shop)} disabled={Boolean(savingKey) || !originDrafts[shop.shop_id]} className="min-h-10 rounded-lg border border-sky-300 px-3 text-xs font-bold text-sky-950 disabled:opacity-50">
                    {savingKey === `shop-${shop.shop_id}` ? 'Enregistrement…' : 'Enregistrer'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
