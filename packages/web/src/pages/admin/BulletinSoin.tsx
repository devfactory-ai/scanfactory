/**
 * Bulletin de Soin Admin UI
 *
 * Manage companies, contracts, conditions, PCT medications, practitioners
 * T031: Bulletin de soin admin
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { LoadingSpinner } from '../../components/LoadingSpinner';

type AdminTab = 'companies' | 'contracts' | 'pct' | 'practitioners';

interface Company {
  id: string;
  name: string;
  code: string;
  lot_max_bulletins: number;
  lot_max_days: number;
  active: number;
}

interface Contract {
  id: string;
  company_id: string;
  company_name?: string;
  policy_prefix: string;
  category: string;
  valid_from: string;
  valid_to: string | null;
  active: number;
}

interface Condition {
  id: string;
  contract_id: string;
  service_type: string;
  reimbursement_rate: number;
  ceiling_per_act: number | null;
  ceiling_annual: number | null;
  waiting_days: number;
  special_conditions: string | null;
}

interface PCTMedication {
  id: string;
  name_commercial: string;
  dci: string | null;
  dosage: string | null;
  price_ttc: number;
  therapeutic_class: string | null;
  valid_from: string;
  valid_to: string | null;
}

interface Practitioner {
  id: string;
  name: string;
  specialty: string | null;
  cnam_code: string | null;
  active: number;
}

// Company Editor Component
function CompanyEditor({
  company,
  onClose,
  onSave,
}: {
  company: Company | null;
  onClose: () => void;
  onSave: (data: Partial<Company>) => void;
}) {
  const [name, setName] = useState(company?.name || '');
  const [code, setCode] = useState(company?.code || '');
  const [lotMaxBulletins, setLotMaxBulletins] = useState(company?.lot_max_bulletins || 50);
  const [lotMaxDays, setLotMaxDays] = useState(company?.lot_max_days || 7);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full">
        <div className="px-6 py-4 border-b">
          <h2 className="text-xl font-semibold">
            {company ? 'Modifier la compagnie' : 'Nouvelle compagnie'}
          </h2>
        </div>

        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nom *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                placeholder="STAR Assurances"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Code *</label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                placeholder="STAR"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Max bulletins/lot
              </label>
              <input
                type="number"
                value={lotMaxBulletins}
                onChange={(e) => setLotMaxBulletins(parseInt(e.target.value) || 50)}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Max jours/lot
              </label>
              <input
                type="number"
                value={lotMaxDays}
                onChange={(e) => setLotMaxDays(parseInt(e.target.value) || 7)}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50">
            Annuler
          </button>
          <button
            onClick={() => onSave({ name, code, lot_max_bulletins: lotMaxBulletins, lot_max_days: lotMaxDays, active: 1 })}
            disabled={!name || !code}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}

// Contract Editor Component
function ContractEditor({
  contract,
  companies,
  onClose,
  onSave,
}: {
  contract: Contract | null;
  companies: Company[];
  onClose: () => void;
  onSave: (data: Partial<Contract>) => void;
}) {
  const [companyId, setCompanyId] = useState(contract?.company_id || '');
  const [policyPrefix, setPolicyPrefix] = useState(contract?.policy_prefix || '');
  const [category, setCategory] = useState(contract?.category || '');
  const [validFrom, setValidFrom] = useState(contract?.valid_from || new Date().toISOString().split('T')[0]);
  const [validTo, setValidTo] = useState(contract?.valid_to || '');

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full">
        <div className="px-6 py-4 border-b">
          <h2 className="text-xl font-semibold">
            {contract ? 'Modifier le contrat' : 'Nouveau contrat'}
          </h2>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Compagnie *</label>
            <select
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value)}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            >
              <option value="">Sélectionner...</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Préfixe police *</label>
              <input
                type="text"
                value={policyPrefix}
                onChange={(e) => setPolicyPrefix(e.target.value)}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                placeholder="POL-"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Catégorie</label>
              <input
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                placeholder="Standard"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Valide depuis</label>
              <input
                type="date"
                value={validFrom}
                onChange={(e) => setValidFrom(e.target.value)}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Valide jusqu'au</label>
              <input
                type="date"
                value={validTo}
                onChange={(e) => setValidTo(e.target.value)}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50">
            Annuler
          </button>
          <button
            onClick={() => onSave({ company_id: companyId, policy_prefix: policyPrefix, category, valid_from: validFrom, valid_to: validTo || null, active: 1 })}
            disabled={!companyId || !policyPrefix}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}

// Condition Editor Component
function ConditionEditor({
  condition,
  contractId,
  onClose,
  onSave,
}: {
  condition: Condition | null;
  contractId: string;
  onClose: () => void;
  onSave: (data: Partial<Condition>) => void;
}) {
  const [serviceType, setServiceType] = useState(condition?.service_type || '');
  const [rate, setRate] = useState(condition?.reimbursement_rate || 0.8);
  const [ceilingPerAct, setCeilingPerAct] = useState(condition?.ceiling_per_act || '');
  const [ceilingAnnual, setCeilingAnnual] = useState(condition?.ceiling_annual || '');
  const [waitingDays, setWaitingDays] = useState(condition?.waiting_days || 0);

  const serviceTypes = ['consultation', 'pharmacie', 'hospitalisation', 'laboratoire', 'radiologie', 'dentaire', 'optique'];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full">
        <div className="px-6 py-4 border-b">
          <h2 className="text-xl font-semibold">
            {condition ? 'Modifier la condition' : 'Nouvelle condition'}
          </h2>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Type de service *</label>
            <select
              value={serviceType}
              onChange={(e) => setServiceType(e.target.value)}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            >
              <option value="">Sélectionner...</option>
              {serviceTypes.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Taux de remboursement * (0-1)
            </label>
            <input
              type="number"
              value={rate}
              onChange={(e) => setRate(parseFloat(e.target.value) || 0)}
              step="0.05"
              min="0"
              max="1"
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Plafond par acte (TND)</label>
              <input
                type="number"
                value={ceilingPerAct}
                onChange={(e) => setCeilingPerAct(e.target.value)}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Plafond annuel (TND)</label>
              <input
                type="number"
                value={ceilingAnnual}
                onChange={(e) => setCeilingAnnual(e.target.value)}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Période de carence (jours)</label>
            <input
              type="number"
              value={waitingDays}
              onChange={(e) => setWaitingDays(parseInt(e.target.value) || 0)}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="px-6 py-4 border-t flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50">
            Annuler
          </button>
          <button
            onClick={() => onSave({
              contract_id: contractId,
              service_type: serviceType,
              reimbursement_rate: rate,
              ceiling_per_act: ceilingPerAct ? parseFloat(String(ceilingPerAct)) : null,
              ceiling_annual: ceilingAnnual ? parseFloat(String(ceilingAnnual)) : null,
              waiting_days: waitingDays,
            })}
            disabled={!serviceType}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}

// Companies Tab
function CompaniesTab() {
  const queryClient = useQueryClient();
  const [showEditor, setShowEditor] = useState(false);
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['bs-companies'],
    queryFn: () => api.get<{ companies: Company[] }>('/api/admin/bulletin-soin/companies'),
  });

  const saveMutation = useMutation({
    mutationFn: (company: Partial<Company>) =>
      editingCompany
        ? api.put(`/api/admin/bulletin-soin/companies/${editingCompany.id}`, company)
        : api.post('/api/admin/bulletin-soin/companies', company),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bs-companies'] });
      setShowEditor(false);
      setEditingCompany(null);
    },
  });

  if (isLoading) return <LoadingSpinner />;

  const companies = data?.companies ?? [];

  return (
    <>
      <div className="flex justify-end mb-4">
        <button
          onClick={() => { setEditingCompany(null); setShowEditor(true); }}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          Nouvelle compagnie
        </button>
      </div>

      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nom</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Code</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Config Lot</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Statut</th>
            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {companies.map((company) => (
            <tr key={company.id}>
              <td className="px-4 py-3 font-medium">{company.name}</td>
              <td className="px-4 py-3 text-gray-500">{company.code}</td>
              <td className="px-4 py-3 text-gray-500">
                {company.lot_max_bulletins} docs / {company.lot_max_days} jours
              </td>
              <td className="px-4 py-3">
                <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${company.active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                  {company.active ? 'Actif' : 'Inactif'}
                </span>
              </td>
              <td className="px-4 py-3 text-right">
                <button
                  onClick={() => { setEditingCompany(company); setShowEditor(true); }}
                  className="text-blue-600 hover:text-blue-900"
                >
                  Modifier
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {showEditor && (
        <CompanyEditor
          company={editingCompany}
          onClose={() => { setShowEditor(false); setEditingCompany(null); }}
          onSave={(data) => saveMutation.mutate(data)}
        />
      )}
    </>
  );
}

// Contracts Tab
function ContractsTab() {
  const queryClient = useQueryClient();
  const [showEditor, setShowEditor] = useState(false);
  const [editingContract, setEditingContract] = useState<Contract | null>(null);
  const [selectedContract, setSelectedContract] = useState<Contract | null>(null);
  const [showConditionEditor, setShowConditionEditor] = useState(false);
  const [editingCondition, setEditingCondition] = useState<Condition | null>(null);

  const { data: companiesData } = useQuery({
    queryKey: ['bs-companies'],
    queryFn: () => api.get<{ companies: Company[] }>('/api/admin/bulletin-soin/companies'),
  });

  const { data: contractsData, isLoading } = useQuery({
    queryKey: ['bs-contracts'],
    queryFn: () => api.get<{ contracts: Contract[] }>('/api/admin/bulletin-soin/contracts'),
  });

  const { data: conditionsData } = useQuery({
    queryKey: ['bs-conditions', selectedContract?.id],
    queryFn: () => api.get<{ conditions: Condition[] }>(`/api/admin/bulletin-soin/contracts/${selectedContract!.id}/conditions`),
    enabled: !!selectedContract,
  });

  const saveContractMutation = useMutation({
    mutationFn: (contract: Partial<Contract>) =>
      editingContract
        ? api.put(`/api/admin/bulletin-soin/contracts/${editingContract.id}`, contract)
        : api.post('/api/admin/bulletin-soin/contracts', contract),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bs-contracts'] });
      setShowEditor(false);
      setEditingContract(null);
    },
  });

  const saveConditionMutation = useMutation({
    mutationFn: (condition: Partial<Condition>) =>
      editingCondition
        ? api.put(`/api/admin/bulletin-soin/conditions/${editingCondition.id}`, condition)
        : api.post(`/api/admin/bulletin-soin/contracts/${selectedContract!.id}/conditions`, condition),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bs-conditions'] });
      setShowConditionEditor(false);
      setEditingCondition(null);
    },
  });

  if (isLoading) return <LoadingSpinner />;

  const companies = companiesData?.companies ?? [];
  const contracts = contractsData?.contracts ?? [];
  const conditions = conditionsData?.conditions ?? [];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Contracts List */}
      <div>
        <div className="flex justify-between mb-4">
          <h3 className="text-lg font-medium">Contrats</h3>
          <button
            onClick={() => { setEditingContract(null); setShowEditor(true); }}
            className="px-3 py-1.5 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700"
          >
            Nouveau contrat
          </button>
        </div>

        <div className="space-y-2">
          {contracts.map((contract) => (
            <div
              key={contract.id}
              onClick={() => setSelectedContract(contract)}
              className={`p-3 border rounded-md cursor-pointer transition ${
                selectedContract?.id === contract.id
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="flex justify-between">
                <span className="font-medium">{contract.policy_prefix}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); setEditingContract(contract); setShowEditor(true); }}
                  className="text-blue-600 hover:text-blue-900 text-sm"
                >
                  Modifier
                </button>
              </div>
              <div className="text-sm text-gray-500">
                {contract.company_name} • {contract.category || 'Standard'}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Conditions */}
      <div>
        {selectedContract ? (
          <>
            <div className="flex justify-between mb-4">
              <h3 className="text-lg font-medium">Conditions: {selectedContract.policy_prefix}</h3>
              <button
                onClick={() => { setEditingCondition(null); setShowConditionEditor(true); }}
                className="px-3 py-1.5 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700"
              >
                Nouvelle condition
              </button>
            </div>

            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left">Type</th>
                  <th className="px-3 py-2 text-right">Taux</th>
                  <th className="px-3 py-2 text-right">Plafond/acte</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {conditions.map((cond) => (
                  <tr key={cond.id}>
                    <td className="px-3 py-2 capitalize">{cond.service_type}</td>
                    <td className="px-3 py-2 text-right">{(cond.reimbursement_rate * 100).toFixed(0)}%</td>
                    <td className="px-3 py-2 text-right">{cond.ceiling_per_act || '-'}</td>
                    <td className="px-3 py-2 text-right">
                      <button
                        onClick={() => { setEditingCondition(cond); setShowConditionEditor(true); }}
                        className="text-blue-600 hover:text-blue-900"
                      >
                        Modifier
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : (
          <div className="text-center py-8 text-gray-500">
            Sélectionnez un contrat pour voir ses conditions
          </div>
        )}
      </div>

      {showEditor && (
        <ContractEditor
          contract={editingContract}
          companies={companies}
          onClose={() => { setShowEditor(false); setEditingContract(null); }}
          onSave={(data) => saveContractMutation.mutate(data)}
        />
      )}

      {showConditionEditor && selectedContract && (
        <ConditionEditor
          condition={editingCondition}
          contractId={selectedContract.id}
          onClose={() => { setShowConditionEditor(false); setEditingCondition(null); }}
          onSave={(data) => saveConditionMutation.mutate(data)}
        />
      )}
    </div>
  );
}

// PCT Tab (Pharmacopée)
function PCTTab() {
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['bs-pct', search],
    queryFn: () => api.get<{ medications: PCTMedication[] }>(`/api/admin/bulletin-soin/pct?search=${search}`),
  });

  if (isLoading) return <LoadingSpinner />;

  const medications = data?.medications ?? [];

  return (
    <>
      <div className="mb-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher un médicament..."
          className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
        />
      </div>

      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left">Nom commercial</th>
            <th className="px-4 py-3 text-left">DCI</th>
            <th className="px-4 py-3 text-left">Dosage</th>
            <th className="px-4 py-3 text-right">Prix TTC</th>
            <th className="px-4 py-3 text-left">Classe</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {medications.map((med) => (
            <tr key={med.id}>
              <td className="px-4 py-3 font-medium">{med.name_commercial}</td>
              <td className="px-4 py-3 text-gray-500">{med.dci || '-'}</td>
              <td className="px-4 py-3 text-gray-500">{med.dosage || '-'}</td>
              <td className="px-4 py-3 text-right">{med.price_ttc.toFixed(2)} TND</td>
              <td className="px-4 py-3 text-gray-500">{med.therapeutic_class || '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-4 p-4 bg-blue-50 rounded-lg">
        <p className="text-sm text-blue-800">
          Pour importer des médicaments en masse, utilisez la page{' '}
          <a href="/admin/lookup-tables" className="underline">Tables de référence</a>{' '}
          avec la fonction d'import CSV.
        </p>
      </div>
    </>
  );
}

// Practitioners Tab
function PractitionersTab() {
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['bs-practitioners', search],
    queryFn: () => api.get<{ practitioners: Practitioner[] }>(`/api/admin/bulletin-soin/practitioners?search=${search}`),
  });

  if (isLoading) return <LoadingSpinner />;

  const practitioners = data?.practitioners ?? [];

  return (
    <>
      <div className="mb-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher un praticien..."
          className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
        />
      </div>

      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left">Nom</th>
            <th className="px-4 py-3 text-left">Spécialité</th>
            <th className="px-4 py-3 text-left">Code CNAM</th>
            <th className="px-4 py-3 text-left">Statut</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {practitioners.map((prac) => (
            <tr key={prac.id}>
              <td className="px-4 py-3 font-medium">{prac.name}</td>
              <td className="px-4 py-3 text-gray-500">{prac.specialty || '-'}</td>
              <td className="px-4 py-3 text-gray-500">{prac.cnam_code || '-'}</td>
              <td className="px-4 py-3">
                <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${prac.active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                  {prac.active ? 'Actif' : 'Inactif'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

// Main Component
export default function AdminBulletinSoin() {
  const [activeTab, setActiveTab] = useState<AdminTab>('companies');

  const tabs: { id: AdminTab; label: string }[] = [
    { id: 'companies', label: 'Compagnies' },
    { id: 'contracts', label: 'Contrats & Conditions' },
    { id: 'pct', label: 'PCT Médicaments' },
    { id: 'practitioners', label: 'Praticiens' },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">
        Administration Bulletin de Soin
      </h1>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="bg-white shadow rounded-lg p-6">
        {activeTab === 'companies' && <CompaniesTab />}
        {activeTab === 'contracts' && <ContractsTab />}
        {activeTab === 'pct' && <PCTTab />}
        {activeTab === 'practitioners' && <PractitionersTab />}
      </div>
    </div>
  );
}
