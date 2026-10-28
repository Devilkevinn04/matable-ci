import { useEffect, useState } from 'react';
import { AdminDeliveryTestControls } from './AdminDeliveryTestControls';
import { AdminDeliveryOperations } from './AdminDeliveryOperations';

interface DeliveryZone {
  id: number;
  label: string;
  is_active: boolean;
}

interface DeliveryTariff {
  id: number;
  origin_zone_id: number;
  destination_zone_id: number;
  origin_label: string;
  destination_label: string;
  amount: number;
  is_active: boolean;
}

interface DeliveryConfiguration {
  zones: DeliveryZone[];
  tariffs: DeliveryTariff[];
}

const formatAmount = (amount: number) => new Intl.NumberFormat('fr-FR').format(amount);
const pairKey = (originId: number, destinationId: number) => `${originId}:${destinationId}`;

export function AdminDeliveryPricing() {
  const [configuration, setConfiguration] = useState<DeliveryConfiguration | null>(null);
  const [zoneDrafts, setZoneDrafts] = useState<Record<number, string>>({});
  const [tariffDrafts, setTariffDrafts] = useState<Record<string, string>>({});
  const [newZone, setNewZone] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const applyConfiguration = (next: DeliveryConfiguration) => {
    setConfiguration(next);
    setZoneDrafts(Object.fromEntries(next.zones.map((zone) => [zone.id, zone.label])));
    setTariffDrafts(Object.fromEntries(next.tariffs.map((tariff) => [
      pairKey(tariff.origin_zone_id, tariff.destination_zone_id),
      String(tariff.amount),
    ])));
  };

  const loadConfiguration = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/admin/delivery/configuration', { credentials: 'include', cache: 'no-store' });
      const data = await response.json() as DeliveryConfiguration & { error?: string };
      if (!response.ok) throw new Error(data.error || 'Impossible de charger la configuration livraison.');
      applyConfiguration(data);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Impossible de charger la configuration livraison.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadConfiguration();
  }, []);

  const saveConfiguration = async (path: string, method: 'POST' | 'PATCH' | 'PUT', body: object, successMessage: string) => {
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch(path, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      const data = await response.json() as DeliveryConfiguration & { error?: string };
      if (!response.ok) throw new Error(data.error || 'Impossible d’enregistrer la configuration livraison.');
      applyConfiguration(data);
      setNotice(successMessage);
      return true;
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Impossible d’enregistrer la configuration livraison.');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const activeZones = configuration?.zones.filter((zone) => zone.is_active) ?? [];

  return (
    <section aria-labelledby="admin-delivery-pricing-title" className="space-y-5">
      <header className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
        <p className="text-xs font-bold uppercase text-emerald-900">Préparation du service</p>
        <h2 id="admin-delivery-pricing-title" className="mt-1 text-xl font-black text-emerald-950">Zones et tarifs de livraison</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-emerald-900">
          Créez les zones de retrait et de destination, puis renseignez le tarif de chaque trajet. Les paires sans tarif actif restent non configurées.
          Cette configuration ne déclenche pas encore de livraison ni de paiement.
        </p>
      </header>

      {loading ? <p role="status" className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-500">Chargement des zones et tarifs…</p> : (
        <>
          <section aria-labelledby="delivery-zones-title" className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 id="delivery-zones-title" className="text-sm font-black text-slate-900">Zones MaTable</h3>
                <p className="mt-1 text-xs leading-5 text-slate-600">Les noms peuvent désigner une commune ou un quartier. Désactiver une zone la retire des prochains réglages sans supprimer son historique de tarifs.</p>
              </div>
              <button type="button" onClick={() => void loadConfiguration()} disabled={saving} className="min-h-9 rounded-lg border border-slate-300 px-3 text-xs font-bold text-slate-700 disabled:opacity-50">Actualiser</button>
            </div>
            <form
              className="mt-4 flex flex-col gap-2 sm:flex-row"
              onSubmit={async (event) => {
                event.preventDefault();
                const created = await saveConfiguration('/api/admin/delivery/zones', 'POST', { label: newZone }, 'Zone ajoutée.');
                if (created) setNewZone('');
              }}
            >
              <label className="sr-only" htmlFor="delivery-zone-name">Nom de la nouvelle zone</label>
              <input id="delivery-zone-name" value={newZone} onChange={(event) => setNewZone(event.target.value)} minLength={2} maxLength={80} required placeholder="Ex. Cocody" className="min-h-11 min-w-0 flex-1 rounded-lg border border-slate-300 px-3 text-sm text-slate-900" />
              <button type="submit" disabled={saving} className="min-h-11 rounded-lg bg-emerald-800 px-4 text-xs font-bold text-white disabled:opacity-50">{saving ? 'Enregistrement…' : 'Ajouter une zone'}</button>
            </form>
            <div className="mt-4 divide-y divide-slate-100">
              {configuration?.zones.map((zone) => (
                <div key={zone.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center">
                  <label className="sr-only" htmlFor={`delivery-zone-${zone.id}`}>Nom de la zone {zone.label}</label>
                  <input id={`delivery-zone-${zone.id}`} value={zoneDrafts[zone.id] ?? zone.label} onChange={(event) => setZoneDrafts((current) => ({ ...current, [zone.id]: event.target.value }))} maxLength={80} className="min-h-10 min-w-0 flex-1 rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-800" />
                  <div className="flex items-center gap-2">
                    <button type="button" disabled={saving || (zoneDrafts[zone.id] ?? zone.label).trim() === zone.label} onClick={() => void saveConfiguration(`/api/admin/delivery/zones/${zone.id}`, 'PATCH', { label: zoneDrafts[zone.id] }, 'Nom de la zone modifié.')} className="min-h-9 rounded-lg border border-slate-300 px-3 text-xs font-bold text-slate-700 disabled:opacity-40">Renommer</button>
                    <button type="button" disabled={saving} onClick={() => void saveConfiguration(`/api/admin/delivery/zones/${zone.id}`, 'PATCH', { is_active: !zone.is_active }, zone.is_active ? 'Zone désactivée.' : 'Zone activée.')} className={`min-h-9 rounded-lg px-3 text-xs font-bold disabled:opacity-50 ${zone.is_active ? 'border border-amber-300 bg-amber-50 text-amber-900' : 'border border-emerald-300 bg-emerald-50 text-emerald-900'}`}>
                      {zone.is_active ? 'Désactiver' : 'Activer'}
                    </button>
                    <span className={`text-xs font-bold ${zone.is_active ? 'text-emerald-800' : 'text-slate-500'}`}>{zone.is_active ? 'Active' : 'Inactive'}</span>
                  </div>
                </div>
              ))}
              {configuration?.zones.length === 0 && <p className="py-5 text-center text-sm text-slate-500">Aucune zone créée. Ajoutez les premières zones pour configurer la grille.</p>}
            </div>
          </section>

          <section aria-labelledby="delivery-tariffs-title" className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 id="delivery-tariffs-title" className="text-sm font-black text-slate-900">Grille des trajets et tarifs</h3>
            <p className="mt-1 text-xs leading-5 text-slate-600">Chaque case correspond à un trajet orienté : zone de retrait → zone de destination. Les tarifs sont saisis en FCFA, sans valeur préremplie.</p>
            {activeZones.length < 1 ? <p className="mt-4 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">Activez ou créez une zone pour commencer la grille.</p> : (
              <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full min-w-max border-collapse text-left text-xs">
                  <thead className="bg-slate-50">
                    <tr className="border-b border-slate-200">
                      <th scope="col" className="sticky left-0 bg-slate-50 px-3 py-3 font-bold text-slate-700">Retrait ↓ / Destination →</th>
                      {activeZones.map((zone) => <th scope="col" key={zone.id} className="min-w-52 px-3 py-3 font-bold text-slate-700">{zone.label}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {activeZones.map((origin) => (
                      <tr key={origin.id} className="border-b border-slate-100 last:border-0">
                        <th scope="row" className="sticky left-0 bg-white px-3 py-3 font-bold text-slate-800">{origin.label}</th>
                        {activeZones.map((destination) => {
                          const key = pairKey(origin.id, destination.id);
                          const existing = configuration?.tariffs.find((tariff) => tariff.origin_zone_id === origin.id && tariff.destination_zone_id === destination.id);
                          return (
                            <td key={destination.id} className="px-3 py-3 align-top">
                              <form
                                className="flex min-w-44 items-center gap-2"
                                onSubmit={(event) => {
                                  event.preventDefault();
                                  void saveConfiguration('/api/admin/delivery/tariffs', 'PUT', {
                                    origin_zone_id: origin.id,
                                    destination_zone_id: destination.id,
                                    amount: Number(tariffDrafts[key]),
                                  }, `Tarif ${origin.label} → ${destination.label} enregistré.`);
                                }}
                              >
                                <label className="sr-only" htmlFor={`delivery-tariff-${key}`}>Tarif {origin.label} vers {destination.label} en FCFA</label>
                                <input id={`delivery-tariff-${key}`} type="number" min={1} max={1000000} step={1} required value={tariffDrafts[key] ?? ''} onChange={(event) => setTariffDrafts((current) => ({ ...current, [key]: event.target.value }))} placeholder="Non configuré" className="min-h-10 w-28 rounded-lg border border-slate-300 px-2 text-sm text-slate-900" />
                                <button type="submit" disabled={saving || !tariffDrafts[key]} className="min-h-10 rounded-lg bg-emerald-800 px-3 text-xs font-bold text-white disabled:opacity-40">{existing?.is_active ? 'Enregistrer' : 'Configurer'}</button>
                              </form>
                              {existing && (
                              <div className="mt-1 flex flex-wrap items-center gap-2">
                                <p className={`text-[11px] ${existing.is_active ? 'text-emerald-800' : 'text-amber-800'}`}>{existing.is_active ? `${formatAmount(existing.amount)} FCFA actif` : `${formatAmount(existing.amount)} FCFA désactivé`}</p>
                                {existing.is_active && <button type="button" disabled={saving} onClick={() => void saveConfiguration(`/api/admin/delivery/tariffs/${existing.id}`, 'PATCH', { is_active: false }, `Tarif ${origin.label} → ${destination.label} désactivé.`)} className="text-[11px] font-bold text-rose-800 underline underline-offset-2 disabled:opacity-40">Désactiver</button>}
                              </div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {configuration && configuration.tariffs.some((tariff) => !tariff.is_active
            || !activeZones.some((zone) => zone.id === tariff.origin_zone_id)
            || !activeZones.some((zone) => zone.id === tariff.destination_zone_id)) && (
            <section aria-labelledby="delivery-inactive-tariffs-title" className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <h3 id="delivery-inactive-tariffs-title" className="text-sm font-black text-amber-950">Tarifs désactivés ou liés à une zone inactive</h3>
              <ul className="mt-3 divide-y divide-amber-200">
                {configuration.tariffs.filter((tariff) => !tariff.is_active
                  || !activeZones.some((zone) => zone.id === tariff.origin_zone_id)
                  || !activeZones.some((zone) => zone.id === tariff.destination_zone_id)).map((tariff) => (
                  <li key={tariff.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-xs text-amber-950">
                    <span>{tariff.origin_label} → {tariff.destination_label} · {formatAmount(tariff.amount)} FCFA</span>
                    <button type="button" disabled={saving || !configuration.zones.find((zone) => zone.id === tariff.origin_zone_id)?.is_active || !configuration.zones.find((zone) => zone.id === tariff.destination_zone_id)?.is_active} onClick={() => void saveConfiguration(`/api/admin/delivery/tariffs/${tariff.id}`, 'PATCH', { is_active: true }, 'Tarif réactivé.')} className="min-h-9 rounded-lg border border-amber-400 bg-white px-3 font-bold disabled:opacity-40">Réactiver</button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      {(error || notice) && <p role={error ? 'alert' : 'status'} className={`rounded-lg border p-3 text-sm font-semibold ${error ? 'border-rose-200 bg-rose-50 text-rose-900' : 'border-emerald-200 bg-emerald-50 text-emerald-900'}`}>{error || notice}</p>}
      {!loading && configuration && <AdminDeliveryOperations />}
      {!loading && configuration && (import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV === true && (
        <AdminDeliveryTestControls zones={configuration.zones} />
      )}
    </section>
  );
}
