# Despesas — Viagem EUA (Latin Exclusive)

Application web à héberger pour le suivi des dépenses de mission de la chef. La chef saisit chaque dépense
(et photographie le reçu) depuis son navigateur ; chaque ligne est **enregistrée automatiquement** dans le
backend de votre choix : un fichier local, **Google Sheets** ou **Zoho Creator**.

Interface en **portugais du Brésil**. Trois catégories : *Cobrar do cliente*, *Despesa Latin Exclusive*,
*Despesa pessoal da chef* (+ *A definir*). Totaux par catégorie et par devise calculés en direct.

---

## 1. Démarrage rapide (mode local, sans configuration)

```bash
npm install
npm start
```

Ouvrez http://localhost:3000. Au premier lancement, les 26 dépenses déjà connues (et les reçus) sont
préchargées. Les données sont stockées dans `data/entries.json`, les reçus dans `public/receipts/`.

> Le mode local sert à tester. Pour partager avec la chef, hébergez l'app (section 3) et choisissez
> Google Sheets ou Zoho Creator (section 2).

---

## 2. Connecter un backend

Copiez `.env.example` en `.env` et renseignez les variables.

### Option A — Google Sheets (`STORE=gsheet`)
1. Créez une feuille Google, notez son **ID** (dans l'URL `/d/<ID>/edit`).
2. Console Google Cloud → créez un **compte de service**, activez l'API **Google Sheets**, générez une clé **JSON**.
3. **Partagez la feuille** avec l'e-mail du compte de service (rôle *Éditeur*).
4. Dans `.env` : `STORE=gsheet`, `GOOGLE_SHEET_ID=...`, `GOOGLE_SERVICE_ACCOUNT_JSON=./service-account.json`.

L'app crée l'en-tête (`id, data, descricao, categoria, valor, moeda, pago_via, recibo, observacao`) et
ajoute une ligne par dépense. La colonne `recibo` contient le nom du fichier ; l'URL cliquable de la photo
est servie par l'app (`PUBLIC_BASE_URL/receipts/<fichier>`).

### Option B — Zoho Creator (`STORE=zoho`)
1. Dans Zoho Creator, créez une application avec un **formulaire** contenant ces champs (link names) :
   `id, data, descricao, categoria, valor, moeda, pago_via, recibo, observacao`, et un **rapport** dessus.
2. Zoho API Console → client **Self Client**, scopes `ZohoCreator.form.ALL,ZohoCreator.report.ALL`,
   générez un **refresh token**.
3. Dans `.env` : `STORE=zoho` + `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`, `ZOHO_REFRESH_TOKEN`,
   `ZOHO_ACCOUNT_OWNER`, `ZOHO_APP_LINK_NAME`, `ZOHO_FORM_LINK_NAME`, `ZOHO_REPORT_LINK_NAME`,
   et `ZOHO_ACCOUNTS_URL` / `ZOHO_API_DOMAIN` selon votre datacenter (.com / .eu / .in).

> Les noms de formulaire/rapport et de datacenter dépendent de votre compte — ajustez les variables.
> Le code gère le rafraîchissement du token automatiquement.

---

## 3. Les reçus (point clé)

La chef joint la photo du reçu au moment de la saisie. Deux modes de stockage (variable `RECEIPTS`) :

- `RECEIPTS=local` : la photo est gardée sur le disque de l'app (`public/receipts/`) et servie à
  `PUBLIC_BASE_URL/receipts/<fichier>`. **Attention** : nécessite un disque **persistant**
  (VPS, ou disque attaché Render) — sinon les photos disparaissent au redéploiement.
- `RECEIPTS=drive` : la photo est envoyée dans un **dossier Google Drive** et le lien durable est
  enregistré dans la colonne `recibo` de la feuille (cliquable directement). Recommandé sur les
  hébergements éphémères (Render/Railway gratuits). Réutilise le même compte de service que Google Sheets ;
  renseignez `GOOGLE_RECEIPTS_FOLDER_ID` (un dossier Drive partagé avec le compte de service en Éditeur).

Dans tous les cas, chaque ligne enregistrée contient un lien vers la photo du reçu.

## 4. Hébergement

L'app est un service Node.js (Express). Choisissez selon vos contraintes :

| Hébergement                     | `STORE`         | `RECEIPTS`            |
|---------------------------------|-----------------|-----------------------|
| Render / Railway (gratuit)      | gsheet ou zoho  | **drive** (éphémère)  |
| Render (plan payant) avec disque| gsheet ou zoho  | local (disque monté)  |
| VPS / serveur (Nginx + PM2)     | gsheet/zoho/local | local                |

- **Render** : `render.yaml` est fourni (build `npm install`, start `npm start`). Renseignez les variables.
- **VPS / Docker** : un `Dockerfile` est fourni. Sinon `npm install --production && PORT=3000 node server.js` derrière Nginx.
- Réglez `PUBLIC_BASE_URL` sur l'URL publique (ex. `https://despesas.latinexclusive.com`).

## 5. Intégrer à votre site Tilda

Tilda n'exécute pas de code serveur : l'app tourne sur l'hébergement ci-dessus, puis vous l'affichez
dans une page Tilda via un bloc **« Insert HTML » (T123)** avec une iframe :

```html
<iframe src="https://despesas.latinexclusive.com"
        style="width:100%;height:1200px;border:0;" loading="lazy"></iframe>
```

Pointez un sous-domaine (ex. `despesas.latinexclusive.com`) vers votre hébergement pour que tout reste
sous votre marque.

---

## 6. API (pour intégration)

| Méthode | Route               | Effet                                  |
|--------:|---------------------|----------------------------------------|
| GET     | `/api/entries`      | liste des lançamentos                  |
| POST    | `/api/entries`      | ajoute (multipart, champ fichier `recibo`) |
| PATCH   | `/api/entries/:id`  | met à jour (ex. `{ "categoria": "..." }`) |
| DELETE  | `/api/entries/:id`  | supprime                               |
| GET     | `/api/config`       | backend actif + listes                 |

---

## 7. À confirmer (comptabilité)

Voir aussi l'encart de réconciliation des précédents fichiers : voiture (sobra 15,21), adiantamento
4 000 → saldo 795,02, et surtout les **virements Latin Exclusive multiples** vus sur le Wise de la chef
(4 000 / 2 710 / 5 420 USD + 2 415 voiture) à rapprocher de vos ordres de virement.
