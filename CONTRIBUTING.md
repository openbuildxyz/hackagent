# Contributing

Thanks for contributing to HackAgent.

## Development

```bash
npm install
cp .env.local.example .env.local
npm run dev
```

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
