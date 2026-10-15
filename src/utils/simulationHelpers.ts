interface Member {
  birth_date: string | null;
  gender: string | null;
  teams?: { name: string } | null;
}

interface CategoryRange {
  name: string;
  minAge: number;
  maxAge: number;
}

export const JUNIOR_MALE_CATEGORIES: CategoryRange[] = [
  { name: 'Juniors A', minAge: 19, maxAge: 21 },
  { name: 'Juniors B', minAge: 17, maxAge: 19 },
  { name: 'Juniors C', minAge: 15, maxAge: 16 },
  { name: 'Juniors D9', minAge: 13, maxAge: 14 },
  { name: 'Juniors D7', minAge: 12, maxAge: 13 },
  { name: 'Juniors E', minAge: 10, maxAge: 11 },
  { name: 'Juniors F', minAge: 8, maxAge: 9 },
  { name: 'Juniors G', minAge: 6, maxAge: 7 },
];

export const JUNIOR_FEMALE_CATEGORIES: CategoryRange[] = [
  { name: 'Juniors Féminines FF21', minAge: 18, maxAge: 21 },
  { name: 'Juniors Féminines FF17', minAge: 15, maxAge: 18 },
  { name: 'Juniors Féminines FF14-9', minAge: 12, maxAge: 14 },
  { name: 'Juniors Féminines FF14-7', minAge: 12, maxAge: 14 },
  { name: 'Juniors Féminines FF11', minAge: 10, maxAge: 11 },
  { name: 'Juniors Féminines FF9', minAge: 8, maxAge: 9 },
  { name: 'Juniors Féminines FF7', minAge: 6, maxAge: 7 },
];

export const ALL_CATEGORIES = [
  'Juniors G',
  'Juniors F',
  'Juniors E',
  'Juniors D7',
  'Juniors D9',
  'Juniors C',
  'Juniors B',
  'Juniors A',
  'Juniors Féminines FF7',
  'Juniors Féminines FF9',
  'Juniors Féminines FF11',
  'Juniors Féminines FF14-7',
  'Juniors Féminines FF14-9',
  'Juniors Féminines FF17',
  'Juniors Féminines FF21',
];

export const isFemale = (member: Member): boolean => {
  return (
    member.gender === 'F' ||
    member.teams?.name?.toLowerCase().includes('féminin') ||
    member.teams?.name?.toLowerCase().includes('ff') ||
    false
  );
};

export const getCurrentSeasonAge = (birthDate: string): number => {
  const birth = new Date(birthDate);
  const refYear = new Date().getFullYear();
  const ref = new Date(refYear, 6, 1);

  return (
    ref.getFullYear() -
    birth.getFullYear() -
    (ref < new Date(ref.getFullYear(), birth.getMonth(), birth.getDate()) ? 1 : 0)
  );
};

export const getFutureSeasonAge = (birthDate: string): number => {
  const birth = new Date(birthDate);
  const refYear = new Date().getFullYear() + 1;
  const ref = new Date(refYear, 6, 1);

  return (
    ref.getFullYear() -
    birth.getFullYear() -
    (ref < new Date(ref.getFullYear(), birth.getMonth(), birth.getDate()) ? 1 : 0)
  );
};

export const getCategory = (age: number, female: boolean): string => {
  const categories = female ? JUNIOR_FEMALE_CATEGORIES : JUNIOR_MALE_CATEGORIES;

  const match = categories.find((c) => age >= c.minAge && age <= c.maxAge);

  if (match) return match.name;
  if (age > 21) return 'Actifs';
  return 'Trop jeune';
};
