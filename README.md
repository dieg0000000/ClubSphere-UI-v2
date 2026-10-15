# ClubSphere - Football Club Management Platform

Une plateforme web complète et responsive pour la gestion d'un club de football suisse, avec admin panel et authentification basée sur les rôles.

## Stack Technologique

- **Frontend**: React 19 + TypeScript + Vite
- **UI**: Tailwind CSS v4 + Lucide React (icônes)
- **Navigation**: React Router v7
- **Backend**: Supabase (PostgreSQL + Auth)
- **Storage**: Supabase Storage
- **Design**: Dark theme avec couleurs primaires (vert foncé + or)

## Fonctionnalités Principales

### 1. Authentification
- Login avec email/password
- Authentification via Supabase Auth
- Redirect basé sur les rôles
- Gestion de session

### 2. Dashboard
- Widget de bienvenue personnalisée
- Statistiques rapides (événements, actualités, membres)
- Vue d'ensemble des prochains événements
- Dernières actualités du club

### 3. Actualités & Annonces
- Liste des articles avec catégories (News, Annonces, Repas de soutien, Événements)
- Recherche et filtrage par catégorie
- Vue d'image pour les articles
- Interface admin pour créer/éditer/supprimer articles

### 4. Navigation Responsive
- Sidebar sur desktop
- Bottom tab bar sur mobile
- Menu déroulant pour modules supplémentaires
- Expérience optimale sur 375px à 1440px

### 5. Gestion des Rôles
Rôles disponibles:
- `admin` - Accès complet
- `committee` - Gestion des événements et annonces
- `coach` - Gestion des équipes et entraînements
- `member` - Accès standard
- `public` - Accès limité

## Structure du Projet

```
src/
├── components/        # Composants réutilisables
│   ├── Layout.tsx    # Layout principal
│   ├── Sidebar.tsx   # Navigation sidebar
│   ├── BottomNav.tsx # Navigation mobile
│   └── ProtectedRoute.tsx
├── pages/            # Pages de l'application
│   ├── Login.tsx
│   ├── Dashboard.tsx
│   ├── News.tsx
│   ├── Setup.tsx
│   └── ComingSoon.tsx
├── context/          # Contextes React
│   └── AuthContext.tsx
├── lib/              # Utilitaires
│   └── supabase.ts
├── types/            # Types TypeScript
│   └── index.ts
├── App.tsx           # Routeur principal
├── main.tsx          # Entry point
└── index.css         # Styles globaux
```

## Installation & Setup

### 1. Cloner et installer
```bash
npm install
```

### 2. Configurer les variables d'environnement
Les variables Supabase sont déjà configurées dans `.env`:
```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

### 3. Initialiser les données de démo
Accédez à `http://localhost:5173/setup` et cliquez sur "Démarrer le Setup" pour créer:
- 3 utilisateurs de démo
- 2 équipes
- 3 articles d'actualités
- 2 événements
- 5 documents

Identifiants de démo:
```
admin@club.ch / admin123
coach@club.ch / coach123
member@club.ch / member123
```

### 4. Lancer le serveur de développement
```bash
npm run dev
```

## Schéma de Base de Données

### Tables principales
- `profiles` - Profils utilisateurs avec rôles
- `teams` - Équipes de football
- `news` - Articles d'actualités
- `events` - Événements du club
- `event_registrations` - Inscriptions aux événements
- `documents` - Documents du club
- `messages` - Messagerie interne
- `feedback` - Retours utilisateurs
- `announcements` - Annonces globales du club

Toutes les tables ont Row Level Security (RLS) activé pour la sécurité.

## Pages Disponibles

### Implémentées
- `/login` - Page de connexion
- `/setup` - Initialisation des données
- `/dashboard` - Tableau de bord principal
- `/news` - Actualités et annonces

### En développement
- `/events` - Événements et registrations
- `/volunteers` - Gestion des bénévoles
- `/teams` - Gestion des équipes
- `/people` - Annuaire
- `/documents` - Documents du club
- `/matches` - Matchs (intégration football.ch)
- `/messages` - Messagerie interne
- `/feedback` - Support & Feedback
- `/admin` - Admin panel

## Design et Branding

### Couleurs
- **Primaire**: Vert foncé (#1a6b3c)
- **Accent**: Or (#f5c518)
- **Background**: Gris très foncé (gris-950)
- **Text**: Gris clair pour contraste optimal

### Typographie
- Font: DM Sans (Google Fonts)
- Hiérarchie: 3 poids (400, 500, 700)
- Line spacing: 150% pour body, 120% pour headings

### Spacing
- Système 8px
- Padding cohérent sur tous les éléments
- Gaps uniformes entre composants

## Features de l'UI

- Loading states sur toutes les actions async
- Empty states avec messages utiles
- Confirmation dialogs avant suppression
- Toast notifications (à implémenter)
- Animations smooth avec transitions CSS
- Dark mode uniquement (selon le cahier des charges)
- Mobile-first responsive design

## Commandes NPM

```bash
npm run dev      # Lancer le serveur de développement
npm run build    # Construire pour production
npm run preview  # Prévisualiser la build
```

## Prochaines Étapes

1. **Events Module** - Gestion des événements et registrations
2. **Volunteer Management** - Système de bénévoles
3. **Teams Directory** - Gestion des équipes et horaires
4. **People Directory** - Annuaire des personnes
5. **Documents** - Upload et téléchargement de documents
6. **Internal Messaging** - Messagerie entre membres
7. **Admin Panel** - Gestion complète des utilisateurs
8. **Intégrations externes** - football.ch, Google Maps, etc.

## Notes de Développement

- Tous les secrets sont stockés côté serveur (via Supabase)
- RLS garantit que seuls les utilisateurs autorisés accèdent aux données
- Les fichiers sont stockés dans Supabase Storage avec contrôle d'accès
- Authentification sans recharge de page avec React Router
- Build optimisée avec Vite (446 KB JS, 4.53 KB CSS gzip)

## Support

Pour toute question ou problème, consultez le cahier des charges ou contactez l'équipe de développement.
Merci. Deploiement fix pdf.
