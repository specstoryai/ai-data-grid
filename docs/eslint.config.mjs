import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'

export default defineConfig([
  ...nextVitals,
  globalIgnores([
    // build and generated output
    '.next/**',
    '.source/**',
    'out/**',
    'node_modules/**',
    'next-env.d.ts',
  ]),
])
