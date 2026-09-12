module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 2022, sourceType: 'module', ecmaFeatures: { jsx: true } },
  plugins: ['@typescript-eslint', 'react', 'react-hooks'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react/recommended',
    'plugin:react-hooks/recommended'
  ],
  settings: { react: { version: 'detect' } },
  env: { browser: true, node: true, es2022: true },
  rules: {
    'react/react-in-jsx-scope': 'off',
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }]
  },
  ignorePatterns: ['out', 'dist', 'node_modules', '*.cjs'],
  overrides: [
    {
      // Theming discipline (see IMPLEMENTATION_PLAN.md §12): a component's inline
      // `style={...}` must resolve colors through tokens.css custom properties, not
      // a hardcoded hex literal — otherwise it silently breaks in the other theme.
      // Scoped to JSX `style` attributes in renderer components only, so it doesn't
      // flag legitimate hex constants elsewhere (marker/level color palettes in
      // shared/types.ts, filterStore.ts, FilterEditorDialog's swatch presets,
      // ExportService's static HTML export palette, or main/index.ts's native
      // window background — none of those are theme-reactive component styles).
      files: ['src/renderer/components/**/*.tsx'],
      rules: {
        'no-restricted-syntax': [
          'warn',
          {
            selector: "JSXAttribute[name.name='style'] Literal[value=/^#[0-9a-fA-F]{3,8}$/]",
            message: 'Do not hardcode a hex color in a style prop — add/use a CSS variable in styles/tokens.css instead.'
          }
        ]
      }
    }
  ]
};
