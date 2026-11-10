# Phone House Maghnia — Démonstration client (Track B)

Single-application update: starting revision `8ce5c6aa7b33203602dc500614ec36564cfbb754`; verified source `2c65b139a2aa474b3015dc2e63040a7251a203e6`. All data is SYNTHETIC and lives only in this browser (IndexedDB). Stores: **Magasin 1 (M01)**, **Magasin 2 (M02)**. Nothing is hosted, no real sign-in, no fiscal receipt, no real money.

## Avant la réunion — conserver les données

1. Ouvrir directement l’application : une seule navigation, aucun sélecteur Test/Production.
2. Paramètres → À propos du stockage local : expliquer les données propres à ce navigateur, sans comptes réels ni synchronisation sécurisée. Ne saisir que des informations fictives.
3. Sélectionner Français puis Magasin 1 (M01). Ne pas réinitialiser automatiquement avant la réunion.
4. Paramètres → Préparer le démarrage vierge : montrer le résumé, le téléchargement privé et les deux opérations distinctes. Ouvrir une préparation puis Annuler, sans confirmer de suppression.

## Parcours en 12 étapes (FR)

1. **Vue d'ensemble** — les chiffres (ventes du jour, téléphones disponibles, accessoires, espèces en caisse, graphique 7 jours) sont calculés à partir du registre de test actuel. Les ventes actuelles déterminent les chiffres ; aucun revenu fictif fixe.
2. **Magasin** (barre du haut) → Magasin 1 (M01) puis Magasin 2 (M02) : stock et chiffres changent de périmètre.
3. **Caisses** → ouvrir une session M01 (ex. 5 000 DZD). Sans session, le point de vente refuse l'encaissement en espèces (bandeau orange).
4. **Téléphones** → réception avec IMEI 1 + IMEI 2 → disponible. Un IMEI déjà utilisé (dans l'un ou l'autre emplacement) est refusé.
5. **Point de vente** → scanner le téléphone → Vérifier → Espèces → montant ≥ total (sous-paiement refusé) → vente de test enregistrée. Saisir nom et prénom fictifs : aperçu facture SPÉCIMEN automatique, garantie SPÉCIMEN distincte. Le téléphone passe à « Vendu », mouvement de caisse ajouté. Réouvrir les documents depuis le catalogue ou SAV ; imprimer ne change aucun registre. Recharger la page : tout est conservé.
6. **Accessoires** → réception +5 → vendre 1 au point de vente → stock −1 avec mouvement.
7. **Caisses → clôture à l'aveugle** : le montant attendu reste masqué pendant le comptage; l'écart est enregistré.
8. **Clients** → nouveau client → sélection au point de vente → **demande de crédit (brouillon)** → **Dettes clients** : remboursement en _projection_ (jamais un encaissement confirmé); dépassement refusé.
9. **Transferts** M01 → M02 : expédition bloquée tant que les deux approbations d'aperçu (Super Admin + Manager M02) manquent → en transit → réception bloquée tant que tout n'est pas scanné → téléphone disponible à M02.
10. **Conventions de facilité** (M01 uniquement) : échéancier; preuve bancaire obligatoire, séparée des espèces. En M02 l'écran est refusé.
11. **SAV** : dossier sur l'IMEI vendu; doublon refusé; remboursement en revue, bloqué (décision OD ouverte).
12. **Achats / Rapports / Journal d'audit** puis **thème sombre** et **العربية** (RTL complet).

## Équipe de test (aperçu de rôle, pas une connexion sécurisée)

- M01 : Propriétaire (Super Admin), Manager M01, Vendeur 001, Vendeur 003.
- M02 : Manager M02, Vendeur 002.

## À dire au client

- Le changement de rôle est un **aperçu**; le masquage des coûts (Super Admin seulement) dans cet aperçu local est **uniquement visuel**, pas une sécurité serveur.
- Les opérations soumises à une décision ouverte (OD-01..OD-18 : remises, crédit, remboursements, transferts partiels, factures/taxes…) restent en **brouillon / revue**, jamais postées.
- Aucun mode Production ne peut être sélectionné. Le code serveur existe mais reste isolé, non connecté et non déployé.

## Limites connues

- Pas d'hébergement, pas de connexion réelle, pas de base de données distante, pas de tests matériels (imprimante, scanner, tiroir-caisse).
- Données propres à ce navigateur : un autre appareil verra ses propres données de test.

## Résultats historiques — antérieurs à l’interface unique

| Contrôle                                                                                                                                            | Résultat exact                                                                            |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Tests automatisés (Vitest)                                                                                                                          | 356 PASS / 0 FAIL (354 + 2 nouveaux tests du tableau de bord)                             |
| Type check + build                                                                                                                                  | OK                                                                                        |
| Clics navigateur par contrôle — 6 combinaisons (FR 1440 clair, FR 390 sombre, AR 1440 clair, AR 768 sombre, AR 390 sombre, EN 768 clair) × 19 pages | 2 860 PASS / 0 FAIL / 12 BLOCKED / 6 NOT TESTED                                           |
| Rendu des pages (débordement, sens RTL/LTR, thème, erreurs) — 3 langues × 3 tailles × 2 thèmes × 19 pages                                           | 342 PASS / 0 FAIL                                                                         |
| Clics dans les 12 autres combinaisons                                                                                                               | NOT TESTED (234 lignes, rendu seul vérifié)                                               |
| Parcours métier depuis Reset (`flows.py`)                                                                                                           | 17 PASS / 0 FAIL                                                                          |
| Cas négatifs + clavier (`r11.py`)                                                                                                                   | 28 PASS / 0 FAIL (assertions; les 108 rendus de ce script ne sont pas comptés séparément) |
| Contrôles réunion (`meeting.py`)                                                                                                                    | 14 PASS / 0 FAIL                                                                          |

BLOCKED = bouton volontairement désactivé jusqu'à un prérequis : « Vérifier le panier de test » (panier vide) et « Enregistrer un appareil opérationnel » (non connecté). NOT TESTED = « Réinitialiser » dans le clic automatique (couvert par `flows.py`).

Matrice complète : `evidence/meeting/final_control_matrix.csv`. Scripts : `final_audit.py`, `flows.py`, `r11.py`, `meeting.py`. Captures : `evidence/meeting/final/`.

Remarques : le site compte 19 pages (18 écrans ERP dont Dettes clients, + Connexion). Les deux derniers ajustements visuels du tableau de bord (échelle du graphique, légende) ont été faits après le dernier passage de clics; les tests automatisés et le type check ont été relancés ensuite. La mise à jour du tableau de bord après une vente est couverte par un test automatisé, pas par un clic navigateur.

## Défauts corrigés dans cette passe

1. Menu latéral mobile fermé encore atteignable au clavier/hors écran (surtout en arabe) → masqué tant qu'il est fermé.
2. Page de connexion entièrement en anglais, validation muette → traduite FR/AR/EN, erreurs visibles, message honnête « non connecté ».
3. Tableau de bord et Rapports affichaient des chiffres fixes → calculés à partir du registre de test.
4. Libellés d'accessibilité en anglais (aperçu de modèle, fournisseur, achat, dépense, recherche, code-barres, référence) → traduits.
5. Langue pouvant revenir au français si la page était rechargée pendant le chargement → enregistrée seulement au changement explicite.
6. Boutons Espèces/Banque sans état « sélectionné » accessible; notifications sans état ouvert/fermé ni fermeture par Échap → corrigés.
7. Équipe de test : M01 sans manager et M02 avec deux vendeurs → corrigé (passe précédente, conservé).

## Vérification actuelle de l’interface unique

- 373 tests automatisés PASS / 0 FAIL, dont migration sans perte et vide persistant dans une IndexedDB simulée isolée.
- 349 contrôles navigateur PASS / 0 FAIL : 342 rendus (19 pages × 3 langues × 2 thèmes × 3 tailles), plus 7 contrôles Paramètres/conservation/export.
- 16 contrôles métier PASS / 0 FAIL (client, caisse, crédit, remboursement, double approbation, scans, preuve bancaire, SAV, M02).
- 16 contrôles réception → vente nominative → documents → tableau de bord → vente accessoire PASS / 0 FAIL, dont impressions sans mutation et documents arabes RTL.
- Compilation et vérification des types : contrôle automatique OK.
- Aucune suppression exécutée dans le navigateur du propriétaire. Les confirmations ont été annulées. La suppression réelle via l’interface n’a PAS été exécutée ; distinction vide/fixtures testée uniquement dans l’environnement automatisé isolé.
- Hébergement, identité réelle, multi-appareils et matériel : NOT RUN. Audit complet de chaque contrôle : NON RELANCÉ ; preuves historiques conservées.
- Preuves reproductibles : `evidence/single-app/`. Les premières tentatives ont rencontré une préférence de thème pas encore chargée et une version en cours de remplacement ; les derniers passages stabilisés sont les résultats ci-dessus.
