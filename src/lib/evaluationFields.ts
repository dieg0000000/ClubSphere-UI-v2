export interface EvaluationData {
  passe: number | null;
  reception: number | null;
  finalisation: number | null;
  jeu_de_tete: number | null;
  technique_centre: number | null;
  marquage: number | null;
  coup_franc: number | null;
  un_contre_un_defensif: number | null;
  un_contre_un_offensif: number | null;
  placement: number | null;
  prise_de_decision: number | null;
  vitesse_execution: number | null;
  capacite_travail: number | null;
  agressivite: number | null;
  confiance_en_soi: number | null;
  personnalite: number | null;
  intelligence_jeu: number | null;
  maitrise_de_soi: number | null;
  condition_physique: number | null;
  resistance_blessures: number | null;
  observations: string | null;
}

export const EMPTY_EVALUATION: EvaluationData = {
  passe: null, reception: null, finalisation: null, jeu_de_tete: null,
  technique_centre: null, marquage: null, coup_franc: null,
  un_contre_un_defensif: null, un_contre_un_offensif: null,
  placement: null, prise_de_decision: null, vitesse_execution: null,
  capacite_travail: null, agressivite: null, confiance_en_soi: null,
  personnalite: null, intelligence_jeu: null, maitrise_de_soi: null,
  condition_physique: null, resistance_blessures: null, observations: null,
};

export const TECHNIQUE_FIELDS: { key: keyof EvaluationData; label: string }[] = [
  { key: 'passe', label: 'Passe' },
  { key: 'reception', label: 'Réception' },
  { key: 'finalisation', label: 'Finalisation' },
  { key: 'jeu_de_tete', label: 'Jeu de tête' },
  { key: 'technique_centre', label: 'Tech. de centre' },
  { key: 'marquage', label: 'Marquage' },
];

export const TACTIQUE_FIELDS: { key: keyof EvaluationData; label: string }[] = [
  { key: 'coup_franc', label: 'Coup-franc' },
  { key: 'un_contre_un_defensif', label: '1x1 défensive' },
  { key: 'un_contre_un_offensif', label: '1x1 offensive' },
  { key: 'placement', label: 'Placement' },
  { key: 'prise_de_decision', label: 'Prise de décision' },
  { key: 'vitesse_execution', label: "Vit. d'exécution" },
];

export const MENTAL_FIELDS: { key: keyof EvaluationData; label: string }[] = [
  { key: 'capacite_travail', label: 'Cap. de travail' },
  { key: 'agressivite', label: 'Agressivité' },
  { key: 'confiance_en_soi', label: 'Auto-confiance' },
  { key: 'personnalite', label: 'Personnalité' },
  { key: 'intelligence_jeu', label: 'Intelligence en jeu' },
  { key: 'maitrise_de_soi', label: 'Auto-contrôle' },
  { key: 'condition_physique', label: 'Cond. physique générale' },
  { key: 'resistance_blessures', label: 'Résistance aux blessures' },
];

export function getActiveSeason(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  if (month >= 6) return `${year}-${year + 1}`;
  return `${year - 1}-${year}`;
}

export function getSeasonOptions(): string[] {
  const now = new Date();
  const year = now.getFullYear();
  const seasons: string[] = [];
  for (let y = year + 1; y >= year - 4; y--) {
    seasons.push(`${y - 1}-${y}`);
  }
  return seasons;
}

export function ratingColor(val: number | null): string {
  if (val === null) return 'var(--text-muted)';
  if (val <= 4) return 'var(--danger)';
  if (val <= 7) return 'var(--warning)';
  return 'var(--success)';
}
