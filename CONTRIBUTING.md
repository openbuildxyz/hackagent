# Contributing

Thanks for contributing to HackAgent.

## Development

```bash
npm install
cp .env.example .env.local
npm run dev
```

Before relying on the public setup docs, run:

```bash
npm run validate:open-source
```

This checks that the canonical `.env.example` template exists and that Quick Start points to the public OpenBuild repository.

Before opening a pull request:

```bash
npm run typecheck
npm run build
```

## Pull Request Guidelines

- Keep changes focused and small.
- Include screenshots for UI changes.
- Do not commit secrets, `.env` files, production tokens, or service-role keys.
- Update documentation when changing public APIs or setup steps.

## Code Style

- Use TypeScript.
- Prefer existing components and CSS variable-based theming.
- Keep light and dark themes equally supported.
