# Guide de Contribution

Merci de votre intérêt pour contribuer à ScanFactory ! Ce guide vous aidera à démarrer.

## Code de Conduite

- Soyez respectueux et inclusif
- Acceptez les critiques constructives
- Concentrez-vous sur ce qui est le mieux pour le projet
- Faites preuve d'empathie envers les autres contributeurs

## Workflow de Développement

### 1. Fork et Clone

```bash
# Fork le repo sur GitHub, puis :
git clone https://github.com/VOTRE-USERNAME/scanfactory.git
cd scanfactory
git remote add upstream https://github.com/devfactory-ai/scanfactory.git
```

### 2. Créer une Branche

```bash
# Synchroniser avec upstream
git fetch upstream
git checkout main
git merge upstream/main

# Créer une branche pour votre feature/fix
git checkout -b feature/ma-nouvelle-feature
# ou
git checkout -b fix/correction-bug-xyz
```

### 3. Développer

```bash
# Installer les dépendances
npm install

# Lancer en développement
npm run dev

# Lancer les tests
npm test
```

### 4. Commiter

Nous utilisons les [Conventional Commits](https://www.conventionalcommits.org/) :

```
<type>(<scope>): <description>

[body optionnel]

[footer optionnel]
```

**Types autorisés :**

| Type | Description |
|------|-------------|
| `feat` | Nouvelle fonctionnalité |
| `fix` | Correction de bug |
| `docs` | Documentation uniquement |
| `style` | Formatage (pas de changement de code) |
| `refactor` | Refactoring du code |
| `perf` | Amélioration des performances |
| `test` | Ajout ou modification de tests |
| `chore` | Maintenance (build, deps, etc.) |

**Scopes courants :**
- `api` - Backend API
- `web` - Application web
- `mobile` - Application mobile
- `scan-lib` - Bibliothèque de scan
- `docs` - Documentation
- `deploy` - Déploiement

**Exemples :**

```bash
git commit -m "feat(api): add batch export endpoint"
git commit -m "fix(web): correct validation form submit"
git commit -m "docs: update API documentation"
git commit -m "chore(deps): update React to v18.2"
```

### 5. Push et Pull Request

```bash
git push origin feature/ma-nouvelle-feature
```

Puis créez une Pull Request sur GitHub.

## Standards de Code

### TypeScript

- Utiliser TypeScript strict (`strict: true`)
- Éviter `any`, préférer `unknown` si nécessaire
- Documenter les types complexes
- Utiliser les interfaces pour les objets

```typescript
// Bon
interface User {
  id: string;
  name: string;
  email: string;
}

function getUser(id: string): Promise<User> {
  // ...
}

// Éviter
function getUser(id: any): any {
  // ...
}
```

### React

- Composants fonctionnels avec hooks
- Nommer les composants en PascalCase
- Un composant par fichier
- Utiliser React Query pour le data fetching

```tsx
// Bon
export function UserProfile({ userId }: { userId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['user', userId],
    queryFn: () => api.getUser(userId),
  });

  if (isLoading) return <LoadingSpinner />;

  return <div>{data.name}</div>;
}
```

### CSS/Styling

- Utiliser TailwindCSS
- Éviter les styles inline sauf cas spéciaux
- Utiliser les classes utilitaires de Tailwind

```tsx
// Bon
<button className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">
  Submit
</button>

// Éviter
<button style={{ padding: '8px 16px', backgroundColor: 'blue' }}>
  Submit
</button>
```

### API (Hono)

- Utiliser les types pour les bindings
- Valider les entrées avec Zod (si ajouté)
- Retourner des erreurs cohérentes

```typescript
// Route handler
app.post('/api/documents', async (c) => {
  const body = await c.req.json();

  // Validation
  if (!body.pipeline_id) {
    return c.json({ error: { code: 'VALIDATION_ERROR', message: 'pipeline_id required' } }, 400);
  }

  // Logic
  const doc = await createDocument(c.env.DB, body);

  return c.json({ document: doc }, 201);
});
```

## Structure des Fichiers

### Nommage

| Type | Convention | Exemple |
|------|------------|---------|
| Composants React | PascalCase | `UserProfile.tsx` |
| Hooks | camelCase avec use | `useAuth.ts` |
| Utilitaires | camelCase | `formatDate.ts` |
| Types | PascalCase | `types.ts` |
| Tests | .test.ts(x) | `UserProfile.test.tsx` |
| Constantes | UPPER_SNAKE | `API_BASE_URL` |

### Organisation

```
src/
├── components/
│   ├── ComponentName/
│   │   ├── index.tsx
│   │   ├── ComponentName.test.tsx
│   │   └── styles.module.css  (si nécessaire)
│   └── ui/  (composants génériques)
├── hooks/
├── lib/
├── pages/  (ou routes/)
├── types/
└── utils/
```

## Tests

### Écrire des Tests

- Tester le comportement, pas l'implémentation
- Un fichier de test par fichier source
- Nommer les tests clairement

```typescript
// Bon
describe('UserProfile', () => {
  it('should display user name when loaded', async () => {
    render(<UserProfile userId="123" />);

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });
  });

  it('should show loading state initially', () => {
    render(<UserProfile userId="123" />);

    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});
```

### Lancer les Tests

```bash
# Tous les tests
npm test

# Avec couverture
npm run test:coverage

# En mode watch
npm run test:watch

# Un seul fichier
npm test -- UserProfile.test.tsx
```

### Couverture Minimum

- Branches : 70%
- Functions : 80%
- Lines : 80%

## Pull Requests

### Checklist PR

Avant de soumettre :

- [ ] Le code compile sans erreurs (`npm run build`)
- [ ] Les tests passent (`npm test`)
- [ ] Le linting passe (`npm run lint`)
- [ ] La documentation est mise à jour si nécessaire
- [ ] Le commit message suit les Conventional Commits
- [ ] La PR a une description claire

### Template PR

```markdown
## Description

Brève description des changements.

## Type de changement

- [ ] Bug fix
- [ ] Nouvelle feature
- [ ] Breaking change
- [ ] Documentation

## Tests

- [ ] Tests unitaires ajoutés/modifiés
- [ ] Tests manuels effectués

## Screenshots (si applicable)

## Checklist

- [ ] Mon code suit les guidelines du projet
- [ ] J'ai fait une self-review
- [ ] J'ai commenté le code complexe
- [ ] J'ai mis à jour la documentation
- [ ] Mes changements ne génèrent pas de warnings
- [ ] Les tests passent localement
```

## Review Process

1. **Automated checks** : CI doit passer (lint, tests, build)
2. **Code review** : Au moins 1 approbation requise
3. **Merge** : Squash and merge vers main

## Reporting Bugs

### Template Issue

```markdown
## Description

Description claire du bug.

## Étapes pour reproduire

1. Aller sur '...'
2. Cliquer sur '...'
3. Voir l'erreur

## Comportement attendu

Ce qui devrait se passer.

## Comportement actuel

Ce qui se passe réellement.

## Screenshots

Si applicable.

## Environnement

- OS: [e.g., macOS 14]
- Browser: [e.g., Chrome 120]
- Node: [e.g., 20.10]
```

## Feature Requests

Avant de proposer une feature :

1. Vérifiez qu'elle n'existe pas déjà
2. Vérifiez qu'une issue similaire n'existe pas
3. Décrivez clairement le problème que ça résout

### Template Feature Request

```markdown
## Problème

Description du problème ou besoin.

## Solution proposée

Description de la solution envisagée.

## Alternatives considérées

Autres approches possibles.

## Contexte additionnel

Tout autre contexte utile.
```

## Releases

Les releases suivent le [Semantic Versioning](https://semver.org/) :

- **MAJOR** : Breaking changes
- **MINOR** : Nouvelles features (backward compatible)
- **PATCH** : Bug fixes (backward compatible)

## Besoin d'Aide ?

- Ouvrez une [Discussion GitHub](https://github.com/devfactory-ai/scanfactory/discussions)
- Consultez la [documentation](./README.md)
- Contactez l'équipe sur Slack (#scanfactory)

## License

En contribuant, vous acceptez que vos contributions soient sous la même licence que le projet.
