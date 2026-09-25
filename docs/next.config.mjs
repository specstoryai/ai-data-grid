import { createMDX } from 'fumadocs-mdx/next'

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Don't let `next dev` auto-generate AGENTS.md / CLAUDE.md agent-rule files
  // in this directory (Next.js 16 feature, on by default).
  agentRules: false,
}

const withMDX = createMDX()

export default withMDX(nextConfig)
