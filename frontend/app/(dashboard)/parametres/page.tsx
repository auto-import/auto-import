'use client';

import { Topbar } from '@/components';
import { Building2, Globe, CreditCard, Bell, Palette, Database } from 'lucide-react';

interface SettingSection {
  id: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  fields: { label: string; value: string; type: 'text' | 'select' }[];
}

const SECTIONS: SettingSection[] = [
  {
    id: 'entreprise',
    icon: <Building2 className="w-5 h-5" />,
    title: 'Informations entreprise',
    description: 'Paramètres généraux de l\'entreprise',
    fields: [
      { label: 'Nom de l\'entreprise', value: 'CarImport DZ', type: 'text' },
      { label: 'Adresse', value: 'Alger, Algérie', type: 'text' },
      { label: 'Téléphone', value: '+213 21 000 000', type: 'text' },
      { label: 'Email', value: 'contact@carimport.dz', type: 'text' },
    ],
  },
  {
    id: 'regional',
    icon: <Globe className="w-5 h-5" />,
    title: 'Paramètres régionaux',
    description: 'Langue, devise et format de date',
    fields: [
      { label: 'Langue', value: 'Français', type: 'select' },
      { label: 'Devise', value: 'DZD (Dinar algérien)', type: 'select' },
      { label: 'Fuseau horaire', value: 'Africa/Algiers (UTC+1)', type: 'select' },
    ],
  },
  {
    id: 'facturation',
    icon: <CreditCard className="w-5 h-5" />,
    title: 'Facturation',
    description: 'Préfixes de référence et numérotation',
    fields: [
      { label: 'Préfixe dossier', value: 'CA-', type: 'text' },
      { label: 'Préfixe facture', value: 'FAC-', type: 'text' },
      { label: 'TVA par défaut', value: '19%', type: 'text' },
    ],
  },
  {
    id: 'notifications',
    icon: <Bell className="w-5 h-5" />,
    title: 'Notifications',
    description: 'Préférences de notifications email et système',
    fields: [
      { label: 'Notifications email', value: 'Activées', type: 'select' },
      { label: 'Alerte ETA', value: '3 jours avant', type: 'select' },
      { label: 'Rappel facture', value: '7 jours après échéance', type: 'select' },
    ],
  },
];

export default function ParametresPage() {
  return (
    <>
      <Topbar title="Paramètres" subtitle="Configuration du système" />
      <div className="p-8 space-y-6">
        {SECTIONS.map((section) => (
          <div key={section.id} className="card">
            <div className="flex items-start gap-4 mb-6">
              <div className="w-10 h-10 rounded-lg bg-surface flex items-center justify-center shrink-0 text-muted">
                {section.icon}
              </div>
              <div>
                <h3 className="text-base font-semibold">{section.title}</h3>
                <p className="text-sm text-muted">{section.description}</p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {section.fields.map((field) => (
                <div key={field.label}>
                  <label className="field-label">{field.label}</label>
                  {field.type === 'text' ? (
                    <input
                      type="text"
                      defaultValue={field.value}
                      className="w-full px-3 py-2 text-sm border border-border rounded-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-foreground/10"
                    />
                  ) : (
                    <select
                      defaultValue={field.value}
                      className="w-full px-3 py-2 text-sm border border-border rounded-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-foreground/10"
                    >
                      <option>{field.value}</option>
                    </select>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* Save button */}
        <div className="flex justify-end">
          <button className="px-6 py-2.5 text-sm font-medium bg-foreground text-white rounded-button hover:opacity-90 transition-opacity">
            Enregistrer les modifications
          </button>
        </div>
      </div>
    </>
  );
}
