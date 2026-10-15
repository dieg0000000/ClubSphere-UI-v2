# Changelog — ClubSphère

Toutes les évolutions notables de l'application sont documentées ici.
Format : [SemVer](https://semver.org/lang/fr/) — MAJEUR.MINEUR.CORRECTIF.

## Version 1.9.22 — 14 octobre 2026

- Notifications : plus de tentative d'enregistrement tant que le compte n'est rattaché à aucun rôle dans le club ; enregistrement automatique dès que le rattachement est fait.
- Accueil et calendrier : pour un entraînement, la présence est affichée « Présent » par défaut avec un lien « Signaler une absence », au lieu des deux boutons Présent / Absent.

## Version 1.9.21 — 14 octobre 2026

- Annuaire du club : la recherche pour lier un membre du comité propose désormais toutes les personnes du club (joueurs, parents, entraîneurs, supporters, comptes), avec ou sans compte ; le compte est relié automatiquement s'il est créé plus tard.
- Annuaire du club : correction d'une erreur à l'ouverture d'une fiche du comité liée à un compte (NPA).

## Version 1.9.20 — 14 octobre 2026

- Messagerie : les conversations s'ouvrent directement sur les derniers messages ; les messages plus anciens se chargent en remontant.
- Messagerie : répondre à un message en le citant (appui long ou balayage sur téléphone, bouton « … » sur ordinateur) ; toucher la citation ramène au message d'origine.
- Notifications : choix des conversations notifiées dans Menu › Notifications (« Mes conversations ») et cloche dans l'en-tête de chaque conversation ; les annonces du club restent toujours notifiées.
- Notifications : le comité est désormais présent, en lecture, dans toutes les conversations d'équipe.
- Correction de la carte « Activez les notifications » sur téléphone.

## Version 1.9.19 — 13 octobre 2026

- Conditions d'utilisation : à la première connexion, chaque utilisateur prend connaissance des conditions (résumé en six points et texte complet) et les accepte ; case à cocher à l'inscription et lors des activations de compte ; date d'acceptation visible dans Mon profil.
- Accueil parents, joueurs et supporters : les deux prochains événements d'équipe en tuiles avec réponse de présence directe, puis les sponsors, les autres tuiles, les messages, le prochain événement du club et la dernière actualité.
- Application Android (test) : l'app reconnaît qu'elle tourne dans l'application native et n'affiche plus l'invitation à installer l'app.

## Version 1.9.18 — 13 octobre 2026

- Classements & Résultats : nouvel onglet « Résultats » (ouvert par défaut) avec les scores et les buteurs saisis par les entraîneurs, filtrables par saison et par équipe ; l'onglet « Classements ACVF » reste inchangé.
- Feuilles de présence (matchs et entraînements) : un entraîneur ne peut plus ouvrir en modification la feuille d'une équipe qu'il n'entraîne pas ; les refus de la base sont affichés en français.
- Score d'un match : après 2 jours, l'entraîneur voit le score en lecture seule et peut encore valider les présences ; le comité peut toujours corriger.
- Page d'un match d'une autre équipe : fiche simplifiée avec le score, les buts et la liste des joueurs présents.

## Version 1.9.17 — 12 octobre 2026

- Mise à jour automatique : l'application installée détecte une nouvelle version au démarrage et au retour au premier plan, et se recharge toute seule ; si vous êtes en train de saisir un formulaire, une bannière « Nouvelle version disponible » propose « Mettre à jour » à la place.
- Première connexion (onboarding) : le type de compte choisi à l'inscription est affiché et ne peut plus être modifié depuis l'application (« Pour changer de type de compte, contactez le club ») ; un compte parent ou joueur n'est plus bloqué s'il choisissait « Supporter » par erreur.
- Rattachement du compte à ses fiches : effectué une seule fois par session, à la connexion (plus d'appels répétés ni d'erreurs 409).
- Vérification en deux étapes : plus d'erreur silencieuse à l'enregistrement de la date du premier rappel.

## Version 1.9.16 — 12 octobre 2026

- Mots de passe : règle unique sur tous les écrans (inscription, invitation, entraîneur, administrateur, comité d'événement, réinitialisation, « Mon profil », écrans d'administration) : 10 caractères minimum, sans exigence de majuscule, de chiffre ou de caractère spécial. Compteur « n/10 » sous le champ, message « Les deux mots de passe ne correspondent pas », et messages en français quand le mot de passe est trop court ou trop courant (figurant dans des listes de mots de passe divulgués).
- Calendrier (mobile, comité et administrateurs) : la fiche rapide d'un match joué affiche désormais le résultat, les buteurs et les passeurs du club, et le badge « Joué » remplace « Planifié ».
- Corrections : lecture des buts d'un match par les entraîneurs (erreur 403 corrigée côté base).

## Version 1.9.15 — 10.10.2026

### Corrections

- Activations : le bouton « Réessayer » retrouve maintenant le joueur dès que le club a corrigé le n° AVS de la fiche (points ou espaces ignorés), et il est aussi disponible pour les rattachements parent sans enfant identifié.
- Activations : « Valider » et « Refuser » sont protégés contre le double clic ; une demande déjà traitée passe directement dans « Traitées ».
- Activations : mention lorsque l'adresse du demandeur n'est ni celle d'un représentant légal ni celle du joueur.

## Version 1.9.14 — 10.10.2026

### Corrections

- Messages et mises à jour en direct : correction d'un plantage (« écran d'erreur ») qui pouvait survenir en rouvrant le menu latéral ou en revenant sur une page.
- Inscriptions : la liste des demandes se met à jour en direct dans l'administration, sans rafraîchir.
- Compatibilité : envoi de fichiers et liens d'invitation fonctionnent aussi sur les navigateurs plus anciens.
- Mode hors ligne : plus de fausse erreur quand le téléphone perd le réseau.
- Page traduite par le navigateur : l'application se recharge d'elle-même au lieu d'afficher un écran d'erreur.
- Suivi des erreurs : filtrage des alertes qui ne viennent pas de l'application.

## Version 1.9.13 — 09.10.2026

- Aide-moniteur : accès en lecture seule à son équipe (il peut écrire dans les messages). Convocation : heure de rendez-vous avant le match (45 min par défaut, réglable par pas de 15), affichée dans l'e-mail, la notification et la page du match. Résultat : saisie des buteurs et des passes décisives après le match (dès les Juniors D-9), visibles par toute l'équipe. Messages : nouveau champ d'écriture, conversation plein écran, collage d'images depuis le presse-papiers.

## Version 1.9.12 — 08.10.2026

- Convocation : l'entraîneur choisit de publier ou non la composition. Sans composition publiée, les joueurs convoqués reçoivent la convocation (date, heure, lieu) et voient la liste des convoqués, sans les postes. Notifications push : l'icône du club et le badge ClubSphère remplacent l'icône par défaut (régression 1.9.9).

## Version 1.9.11 — 08.10.2026

- Création de compte : si une invitation entraîneur existe pour l'adresse saisie, la page le signale et invite à utiliser le lien reçu par e-mail (joueur, parent, supporter).

## Version 1.9.10 — 07.10.2026

- Annuaire › Club : le bouton « Modifier » d'un membre du comité lié à un compte fonctionne à nouveau (la date de naissance est lue sur la fiche du membre).

## Version 1.9.9 — 07.10.2026

- Logo du club : désormais rangé dans un dossier propre au club.
- Photos des membres du comité et des arbitres : rangées dans un dossier propre au club.
- Sécurité : seuls l'admin et le comité du club peuvent modifier le logo et ces photos.

## Version 1.9.8 — 07.10.2026

- Les entraîneurs peuvent ajouter ou remplacer la photo d'un joueur de leur équipe, depuis la fiche du joueur dans Mes Équipes.
- Pièces jointes de la messagerie : elles ne sont plus accessibles par une adresse publique ; seuls les participants de la conversation peuvent les ouvrir.

## Version 1.9.7 — 07.10.2026

- Rattachement automatique des enfants à chaque connexion : un compte créé comme entraîneur ou membre du comité voit désormais ses enfants dès sa première connexion.

## Version 1.9.6 — 07.10.2026

- Feuille de présence des séances : la liste part des fiches de présence de chaque séance ; les joueurs des équipes secondaires (gardiens) apparaissent avec le badge « Secondaire ».
- Les joueurs archivés n'apparaissent plus sur la feuille de présence ni dans les compteurs.

## Version 1.9.2 — 03.10.2026

- iPhone : plus d'erreur au chargement du tableau de bord dans Safari ; indication pour ajouter ClubSphère à l'écran d'accueil et recevoir les notifications.

## Version 1.9.1 — 02.10.2026

- Entraîneur › Séances : les informations du mode pluie se chargent à nouveau (erreur corrigée).
- Admin › Équipes › Joueurs rattachés : bouton « Rattacher un joueur » et recherche corrigée pour une équipe encore vide.
- Surveillance des erreurs de l'application activée (aucune donnée personnelle transmise).

## Version 1.9.0 — 02.10.2026

- Un joueur peut appartenir à plusieurs équipes : son équipe principale et des équipes secondaires, visibles dans sa fiche, dans « Mes équipes » et dans le calendrier.
- Nouveau : les groupes d'entraînement (gardiens, préparation physique…), sans championnat ni catégorie, avec leurs propres séances et présences.
- Admin › Équipes : bouton « Rattacher un joueur » pour ajouter un joueur d'une autre équipe ; badge « Secondaire » dans les listes.
- Entraîneur › Présences : la feuille de présence inclut les joueurs rattachés ; la mention « par défaut » disparaît dès que l'entraîneur a pointé le joueur.
- Mot de passe : nouveaux messages, plus clairs, et un message dédié quand le mot de passe choisi est trop connu.
- Admin › Utilisateurs › Définir un mot de passe : le message du serveur est affiché tel quel.
- Corrections : création d'un groupe de discussion « Équipe complète », liste des événements dans les dépenses.

## Version 1.8.2 — 01.10.2026

- Rôles multiples : une personne qui cumule plusieurs casquettes (par exemple comité, entraîneur et parent) retrouve toutes ses fonctions : chartes à valider, documents, notifications, calendrier. L'espace affiché à la connexion suit sa casquette la plus élevée.
- Sondages : réponses en couleur (vert = participe, rouge = absent), date complète en en-tête, confirmation visible après chaque réponse. Sur smartphone, la clôture d'un sondage se fait désormais depuis un ordinateur.
- Lisibilité : barres de défilement plus visibles.
- Séances : correctifs du bouton « Notifier les participants ».

## Version 1.8.1 — 30.09.2026

- Séances : nouveau bouton « Notifier les participants ». Chaque participant reçoit une notification et un e-mail avec la date, le lieu et l'ordre du jour. Un seul envoi par personne : après avoir ajouté quelqu'un, un nouveau clic ne prévient que les nouveaux.

## Version 1.8.0 — 30.09.2026

- Sondages : invitations (une date) et sondages de dates (2 à 10 dates) avec réponse « Je participe / Absent ». Destinataires : entraîneurs, comité, opérationnel, équipes (staff, joueurs, parents des juniors). Notification à la création ; modification possible ; date retenue à la clôture.
- Matchs : filtre « À venir / Passés / Tous » dans Administration › Matchs et affichage du score dans l'ordre domicile / extérieur.
- Séances : les membres « Opérationnel » peuvent être ajoutés aux participants.
- Photo d'équipe et résultats sur le site du club (module Site internet).

## Version 1.7.0 — 30.09.2026

- Score des matchs : saisie par le staff à la validation des présences (dès les juniors D-9), affichage dans le calendrier et les détails du match.
- Photo d'équipe : une photo par équipe et par saison, ajoutée par l'entraîneur principal ou le comité.
- Site internet du club : nouveau menu Admin › Site internet (aperçu, contenus à publier, équipes, histoire, joueurs masqués, sponsors), case « Publier sur le site du club » sur les actualités, événements et documents, publication de l'effectif et de la photo par équipe, case « Ne pas apparaître sur le site » pour les joueurs et la confrérie.
- Paramètres du club : interrupteur « Gestion du site internet ».
- Notifications : bouton « Réactiver les notifications sur cet appareil » et renouvellement automatique à l'ouverture.
- Messagerie : la fonction affichée à côté d'un nom correspond à la conversation (comité, staff d'équipe).
- Équipes : la saison en cours est proposée par défaut.

## Version 1.6.11 — 28.09.2026

- « Actualités » ajoutées au menu smartphone pour les administrateurs.
- Tableau de bord administrateur : la tuile « Joueurs dans l'annuaire » ne compte plus les membres archivés.
- Création de compte : indication « min. 10 caractères », messages d'erreur en français (mot de passe trop faible, trop de tentatives, compte déjà existant…), protection contre les envois répétés.

## Version 1.6.10 — 28.09.2026

- Actualités : les affiches et images verticales s'affichent désormais en entier, avec un plein écran d'un simple toucher.

## Version 1.6.9 — 25.09.2026

- Calendrier : il n'affiche plus que les matchs et les entraînements, pour tous les rôles. Les événements du club restent dans Vie du club > Événements.
- Accueil : le bandeau jaune s'appelle désormais « Vos prochains matchs » et liste les matchs des 14 prochains jours.
- Mon profil : les blocs Informations Football et Mes factures sont de retour pour les joueurs.
- Équipes : un joueur archivé n'apparaît plus dans l'annuaire de son équipe ni dans les compositions, et ne peut plus être convoqué.
- Messagerie : correction d'une erreur silencieuse lors du marquage des messages comme lus.

## Version 1.6.8 — 25.09.2026

- Calendrier du club : les entraînements de toutes les équipes s'affichent à nouveau pour les membres sans équipe ; un supporter voit les matchs et les événements, l'admin et le comité voient tout.
- Un joueur archivé n'a plus accès au club ; s'il se reconnecte, il peut rester supporter sans recréer de compte. Un joueur inactif garde l'accès.
- Réactiver un joueur archivé depuis sa fiche (bouton « Réactiver le joueur »).
- Erreurs de chargement : une carte « Impossible de charger les données » avec « Réessayer » remplace les écrans vides ; les erreurs sont tracées en console.
- Messages de mot de passe et de connexion en français.
- Menu : l'entrée « Organisation » est disponible depuis toutes les pages ; l'accueil salue toujours la personne connectée.
- Finitions : « Catégorie : », bandeau pluie « jusqu'à nouvel avis », sélecteur d'équipe masqué avec une seule équipe, e-mails lisibles dans l'Annuaire Club.
- Console plateforme : le journal d'activité indique l'enregistrement concerné (nom du joueur, du sponsor, du match…) et se filtre par enregistrement.

## Version 1.6.7 — 23.09.2026

- Correction : le Planning des matchs s'affiche désormais pour les entraîneurs qui sont aussi administrateurs ou membres du comité.
- Correction : l'accueil de l'espace entraîneur affiche à nouveau le prochain entraînement.
- Amélioration : les boutons de présence sont désormais identiques pour les entraînements et les matchs.

## Version 1.6.6 — 23.09.2026

- Correctif : le Planning des matchs de l'espace Entraîneur affiche les matchs de l'équipe entraînée, même lorsque l'entraîneur est aussi parent d'un joueur d'une autre équipe.
- Correctif : le choix d'équipe du Planning des matchs ne propose plus que les équipes que l'on entraîne.
- Correctif : le choix d'équipe du Planning et du Calendrier ne dépasse plus de l'écran sur smartphone.

## Version 1.6.5 — 23.09.2026

- Correctif : le Planning des matchs de l'espace Entraîneur affiche les matchs de toutes les équipes dont on fait partie du staff.
- Amélioration : le Planning des matchs de l'espace Entraîneur n'affiche que les matchs de la saison en cours.
- Nouveauté : le numéro de version de l'application est affiché en bas de la page Mon Profil sur smartphone.
- Nouveauté : une image peut désormais être téléversée directement dans une actualité, en plus d'un lien.

## Version 1.6.4 — 22.09.2026

- Nouveauté : les entraîneurs voient les matchs de leurs équipes, avec les convocations et les présences, directement dans l'espace Entraîneur.
- Correctif : l'espace Entraîneur et le calendrier affichent désormais toutes les équipes dont on est membre du staff, même sans être joueur de l'équipe.
- Sécurité : un entraîneur dont l'accès a été retiré par le club, ou qui a supprimé son compte, ne peut plus modifier les données du club.

## Version 1.6.3 — 22.09.2026

**Barre de navigation du bas (smartphone)**
Le contenu des pages ne passe plus sous la barre : le dernier élément d'une liste
ou d'un formulaire reste toujours visible et cliquable. Les deux extrémités de la
barre sont de vrais demi-cercles. La pastille de l'onglet actif est maintenant
identique sur les cinq onglets, avec une marge régulière sur ses quatre côtés, et
le compteur de messages non lus reste lisible et à l'intérieur de la barre.

**Planning des entraînements**
Les créneaux s'affichent du plus tôt au plus tard, et non plus dans leur ordre de
création.

**Ajouter un entraîneur**
La recherche trouve aussi les membres du comité et les personnes qui ne sont pas
joueurs. Un responsable technique ou un président de juniors peut ainsi reprendre
une équipe ad interim.

**Rappels de match**
Ils ne sont plus publiés dans la messagerie du club. Ils partent uniquement en
notification push et par e-mail, à la personne concernée.

**Rôles et accès**
L'accès entraîneur, membre ou comité est attribué automatiquement dès qu'une fiche
est créée ou rattachée à un compte existant. Il n'est plus nécessaire de
réactiver le compte pour que le bon onglet apparaisse.

## [1.6.2] — 2026-09-20
- Correctif : toutes les heures de la journée sont disponibles dans le planning des entraînements (créneaux, plan pluie, modification d'une séance).
- Correctif : deux créneaux consécutifs d'une même équipe (18h00–19h00 puis 19h00–20h00) ne sont plus refusés comme chevauchement.

## [1.6.1] — 2026-09-20
- Correctif : une salle est un espace unique (plus de demi-terrains ni de quarts sur les salles).

## [1.6.0] — 2026-09-20
- Mode pluie : le club définit, sur chaque créneau d'entraînement, un plan pluie (lieu de repli, horaire, remarque) ; les salles sont des terrains de type « Salle » et affichent les créneaux qui s'y replient. Le comité active le mode pluie d'un bouton (confirmation) : les entraînements du jour basculent sur leur plan pluie, joueurs et parents reçoivent une notification, une bande rouge s'affiche dans toute l'application, un rappel part chaque jour à midi tant que le mode reste actif ; la désactivation remet tout en place. Les calendriers, fiches de séance et feuilles de présence affichent le lieu et l'horaire de repli avec le badge « Pluie » et l'horaire habituel barré. Option à activer dans Paramètres › Informations.
- Convocations : rappel visible des joueurs ajoutés pas encore notifiés.
- Corrections : historique des synchronisations ASF, libellés avec accents, capacité conservée à la modification d'un terrain.

## [1.5.2] — 2026-09-18
- Sponsors : affichage aléatoire pondéré du carrousel (chaque sponsor actif apparaît selon sa priorité), mention « Non affiché » dans Admin › Sponsors pour les sponsors non actifs, nouvelle mise en page de la page (chronologie, cartes par saison : somme garantie, sponsoring en nature, valeur catalogue des prestations), correction du libellé « valeur estimée ».
- Présences aux matchs (mode présent par défaut) : badge « Présent(e) · par défaut » sur le calendrier et la page du match, déclaration d'absence avec motif et retour « Finalement présent(e) », ligne Convoqué(e) / Non retenu(e) quand une convocation est publiée, indisponibilités (maladie, blessure) évaluées à la date du match ; côté entraîneur : compteurs Disponibles / Indisponibles / Absents puis Convoqués / Non retenus, rappel informatif du match, statuts alignés, menu de statut aux couleurs du club, carte de planning cliquable avec l'état de la convocation, mise à jour immédiate entre les blocs.
- Convocations : une seule notification par publication (plus de doublon), rappel visible des joueurs ajoutés pas encore notifiés, e-mail de convocation adapté au mode présent par défaut, accès des entraîneurs via le staff d'équipe.
- Calendrier ASF : avertissement avant activation de la synchronisation, synchronisation à 07h30 et 16h30, un match sans heure fixée n'est plus notifié comme un changement d'heure ; e-mail « Heure fixée » quand l'horaire est posé.

## [1.5.1] — 2026-09-17
- Correctifs : un seul bouton « afficher le mot de passe » sur Edge ; sécurité renforcée des changements d'e-mail et de mot de passe par l'administration.

## [1.5.0] — 2026-09-17
- Comité : e-mail de communication distinct de l'e-mail du compte et option « ne pas afficher mon numéro ». Cotisations : exonération des membres du comité et des entraîneurs, exonération au cas par cas, récapitulatif de génération détaillé. Joueur et entraîneur : rapprochement « même personne » sur le numéro AVS et la licence, pays de résidence. Factures : e-mail de la configuration Finances, logo et QR nets, PDF allégés. Listes : nombre de lignes et de résultats filtrés dans les titres. Fiche joueur : nom et e-mail du compte parent, fratrie complète. Présences aux matchs : présent par défaut respecté sur toutes les feuilles.

## [1.4.5] — 2026-09-17
- Ordre des équipes selon l'ACVF (actifs du plus haut au plus bas niveau, seniors, juniors A → G), logo et QR nets sur les factures PDF, fratrie reconnue pour tous les joueurs (y compris sans équipe), nom et e-mail du compte parent dans la fiche joueur, joueur archivé sans accès au club.

## [1.4.4] — 2026-09-16 — Retours FC Crissier
- Présences aux matchs : « présent par défaut » appliqué comme pour les entraînements.
- Fratrie reconnue quel que soit l'ordre des représentants légaux ; nom du compte parent affiché en repli.
- Facture PDF : logo aux bonnes proportions, adresse placée pour les enveloppes à fenêtre.
- Bouton Boutique pour les joueurs adultes.
- Colonne Nom avant Prénom dans les listes.
- Écran Facturation sponsors pleine page.
- Règle de mot de passe affichée selon le rôle (10 caractères pour le comité, 8 sinon).

## [1.4.3] — 2026-09-16
- Onglet Historique : arrivées, départs (avec club de destination) et fonctions par équipe, alimentés automatiquement et complétables à la main.
- Numéro de maillot et réglage « Reçoit les convocations ».
- Fiches de présence créées automatiquement pour un joueur qui rejoint une équipe.

## [1.4.2] — 2026-09-16
- Badges de disponibilité (Blessé / Malade / Pause) dans Modifier l'équipe › Joueurs et dans la fiche joueur côté entraîneur.
- Badges de rôle harmonisés dans les infos d'un groupe de discussion.
- Écran « Vérifiez votre boîte e-mail » aligné sur le bouton « Confirmer mon adresse ».

## [1.4.1] — 2026-09-16
- Les liens des e-mails automatiques (rappels d'entraînement, événements, bénévoles, chartes, confirmations d'inscription, factures) pointent désormais sur l'adresse du club.
- Expéditeur de secours si le domaine e-mail du club n'est pas vérifié.
- Une adresse sans club (ou avec un club inconnu) renvoie vers clubsphere.ch.
- Accents rétablis sur la page de réponse aux rappels d'entraînement.

## [1.4.0] — 2026-09-15
- Groupes de discussion pour le comité : Comité, cercle des donateurs, Supporters, Bénévoles d'un événement et groupes personnalisés, en mode Discussion ou Annonce ; renommage, gestion des participants et mise à jour depuis la liste.
- Les parents voient la disponibilité de leur enfant (accueil et Mes Enfants) ; le joueur adulte la voit sur son accueil.
- Convocation : un joueur convoqué devenu indisponible reste dans la liste, grisé, avec sa date de retour et un avertissement pour l'entraîneur.
- La photo ajoutée par une famille est désormais visible par le club et l'entraîneur.

## [1.3.0] — 2026-09-15
- Nouveau statut de disponibilité (Blessé / Malade / Pause) posé par le comité, avec date de retour et remarque : badge dans la liste des joueurs, filtre « Indisponibles », joueur grisé dans l'effectif et les convocations de l'entraîneur, information visible par les parents.
- Retour automatique à « Disponible » le lendemain de la date prévue.
- Classements & Résultats : un bouton par équipe vers le match center football.ch.
- Le filtre « Sans équipe » n'inclut plus les joueurs archivés ; nouveau filtre « Archivés ».

## [1.2.3] — 2026-09-15
- E-mails de confirmation d'inscription aux couleurs du club, page de confirmation résistante aux scanners d'e-mail, message clair si un compte existe déjà, recherche « Créer un accès » regroupée par personne.

## [1.2.2] — 2026-09-14
- Correctifs : réinitialisation du mot de passe pour les comptes avec vérification en deux étapes, reprise après erreur sans nouveau lien, messages d'erreur explicites.

## [1.2.1] — 2026-09-14
- Correctifs : lien de réinitialisation du mot de passe résistant aux scanners d'e-mail, en-tête du profil entraîneur, colonne Postes de l'annuaire, libellé du cercle de donateurs sur smartphone, langue de la page déclarée en français.

## [1.2.0] — 2026-09-14
- Créer un accès par invitation e-mail (page d'activation, invitations en attente) ; rôles de staff sur l'accueil et le profil entraîneur.

## [1.1.1] — 2026-09-14
- Staff d'équipe sur la page Équipes du comité mobile ; numérotation du formulaire d'équipe.

## [1.1.0] — 2026-09-14
### Nouveautés
- **Staff d'équipe** : plusieurs personnes par équipe avec un rôle (entraîneur principal, assistant, aide-moniteur, préparateur physique, entraîneur des gardiens, responsable d'équipe).
- **Fiche entraîneur** : lien avec la fiche joueur (aides-moniteurs juniors), civilité, nationalité, date d'entrée, remarques, coordonnées bancaires (IBAN protégé).
- **Équipes** : libellé ASF (match center) pour la synchronisation des matchs ; tournois E-F-G synchronisés.
- **Nationalité** : sélection dans une liste de pays.

### Corrections
- Activation de la double authentification (facteur non vérifié bloquant une nouvelle tentative).
- Affichage des noms d'équipes longs (plus de coupure sur les cartes mobile).
- Icône du club dans l'onglet du navigateur.

## [1.0.0] — 2026-09-13
### Mise en production
- Première version de production.

## [0.21.0] — 2026-08-13
### Nouveautés
- **Navigation mobile coach** : barre de navigation en bas de l'écran avec
  accès direct aux présences, feuille de menu contextuel et cartes de sessions
  mobiles adaptées.
- **Polish mobile des pages coach** : cartes compactes sur la liste d'équipes,
  en-tête de profil empilé verticalement, liste de joueurs en format carte sur
  mobile au lieu du tableau bureau.

## [0.11.0] — 2026-07-10
### Nouveautés
- **Inscriptions aux événements unifiées** : les inscriptions des membres,
  du public (lien partagé) et les saisies manuelles du club vivent désormais
  dans un seul système, avec les mêmes options de prix. L'inscription membre
  est pré-remplie (y compris pour les parents) et sécurisée côté serveur.
- **Gestion enrichie des inscriptions** : ajout manuel par le club (personne
  qui téléphone), annulation avec trace et réactivation, annulation par le
  membre depuis son compte, détail de réservation modifiable avec montant
  ajustable, export Excel avec la liste des participants par table.
- **Notification à la création d'événement désormais optionnelle** : un
  interrupteur (désactivé par défaut) décide si les membres reçoivent
  l'annonce par email ou pas.
### Corrections
- Les rappels automatiques (J-8/J-3/J-1) utilisent le nouveau système
  d'inscriptions.
- Lisibilité : mention « Inscription gratuite », boutons de sélection.

## [0.10.0] — 2026-07-08
### Nouveautés
- **Inscription publique aux événements** : chaque événement peut ouvrir un lien
  d'inscription public (régénérable), avec options de prix configurables
  (places individuelles et forfaits tables), formulaire en 3 étapes
  (coordonnées, réservation, participants), validation du téléphone,
  montant calculé et vérifié côté serveur, email de confirmation aux couleurs
  du club avec politique d'annulation.
- **Page de détail des événements** : nouvelle vue dédiée par événement
  (jauge de remplissage, lien public, onglets Inscriptions / Bénévoles /
  Rappels), table unifiée des inscriptions internes et publiques avec totaux,
  édition des participants d'une réservation, statuts modifiables.
- **Liste des événements allégée** : ligne cliquable vers le détail,
  suppression de l'ancienne expansion, compteur d'inscriptions incluant
  les places publiques.

## [0.9.0] — 2026-07-08
### Nouveautés
- **Photos des joueurs** : photo type passeport obligatoire à l'inscription
  (activation de compte et inscription publique), transfert automatique au
  profil lors de la validation, gestion depuis la fiche joueur
  (ajouter / remplacer / télécharger), avatars dans les listes, photo et
  numéro de licence ASF visibles par les parents. Stockage privé,
  affichage par liens signés.
### Corrections
- Le lien d'inscription publique des joueurs fonctionne désormais pour les
  visiteurs non connectés.
- La photo d'un joueur se met à jour immédiatement après un remplacement,
  sans recharger la page.

## [0.8.0] — 2026-07-07
### Nouveautés
- **Onboarding club 100 % autonome** : la création d'un club depuis la
  console provisionne tout (catégories, diplômes, types de séances, saison
  en cours, configuration financière), déclare automatiquement le
  sous-domaine et envoie l'invitation au premier administrateur.
- **Import de joueurs à grande échelle** : mapping des catégories ASF
  fiabilisé, testé avec un club de 1000 joueurs et 70 équipes.
### Corrections
- Formulaire équipe : sélection de la saison depuis les saisons du club,
  entraîneur facultatif, champs manquants signalés en rouge.

## [0.7.0] — 2026-07-06
### Nouveautés
- **Saisie des présences J+S après match** : pré-remplissage depuis les
  convocations, renforts inter-équipes, validation par l'entraîneur.
- **Page J+S Présences repensée** : portées Entraînements / Matchs / Cumul,
  listes accordéon par équipe.
- **Documents de séance** : pièces jointes aux PV du comité (ajout en
  brouillon, liens sécurisés).
### Corrections
- Désactivation d'accès entraîneur fiabilisée (plus d'états intermédiaires).
- Lisibilité des messages sur les pages de connexion et de réinitialisation.

## [0.6.0] — 2026-06
### Nouveautés
- **Thème clair / sombre** sur toute l'application, design system unifié
  (boutons, badges, alertes, onglets).
- Emails multi-tenant aux couleurs de chaque club (réinitialisation de mot
  de passe, chartes, notifications).
- Numéro AVS unique par club.

## [0.5.0] — 2026-05
- Migration en production : GitHub + Vercel, domaine clubsphere.cloud,
  sous-domaines par club, console d'administration plateforme.
- Modules fondateurs : équipes, joueurs, entraîneurs, événements, bénévoles,
  finances (cotisations, rappels, réconciliation camt.054), documents et
  chartes, actualités, notifications, PV de séances, présences J+S.