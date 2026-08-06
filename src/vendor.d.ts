// composerize and decomposerize ship no type declarations, which makes `astro check` fail — and
// `pnpm deploy` runs `astro check`. Both are used by the Docker post's ComposeConverter island.
declare module 'composerize' {
  const composerize: (dockerRunCommand: string, existingCompose?: string | null, composeVersion?: string, indent?: number) => string;
  export default composerize;
}

declare module 'decomposerize' {
  const decomposerize: (composeYaml: string) => string;
  export default decomposerize;
}
